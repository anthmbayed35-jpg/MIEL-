import fs from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { proxy } from "@/proxy";
import { canGrantRole } from "@/lib/roles";
import { createMember, MemberError } from "@/lib/members";
import { generateTemporaryPassword } from "@/lib/temp-password";
import { passwordProblem } from "@/lib/passwords";
import { createSession, lookupSession, SESSION_COOKIE } from "@/lib/session";
import { totpNow } from "@/lib/totp";
import { h, ID, jar, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const act = async (p: Promise<unknown>) => p.then((r) => ({ r }), (e: Error) => ({ e: e.message }));
const asOwner = () => {
  h.user = { id: ID.owner, email: "owner@t.test" };
};
type Res = { ok?: string; error?: string; copy?: { label: string; value: string; note?: string; button?: string } } | null;

async function add(fields: Partial<Record<"name" | "email" | "role" | "confirm_owner", string>> = {}): Promise<Res> {
  const { addMember } = await import("@/app/admin/(app)/settings/team/actions");
  return addMember(null, form({ name: "New Member", email: "new.member@t.test", role: "staff", ...fields }));
}
/** Create a member as the owner and return their temporary password (test only: it lives in this variable, never in a log). */
async function created(fields: Parameters<typeof add>[0] = {}) {
  asOwner();
  const r = await add(fields);
  if (!r?.copy) throw new Error(`not created: ${r?.error}`);
  return { password: r.copy.value, email: (fields.email ?? "new.member@t.test").toLowerCase() };
}
async function signInWith(email: string, password: string) {
  jar.clear();
  h.user = null;
  const { login } = await import("@/app/admin/login/actions");
  return act(login(null, form({ email, password })));
}
const row = (email: string) => sql().prepare("SELECT * FROM admin_users WHERE email = ?").get(email) as Record<string, any>;

beforeEach(async () => {
  resetState();
  await seedStore();
  reqHeaders["x-forwarded-for"] = "4.4.4.4";
  delete process.env.SITE_MODE;
});

describe("the temporary password", () => {
  it("is long, random, free of look-alike characters and always passes the normal strength rules", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^[A-HJ-NP-Za-hj-km-np-z2-9]{5}(-[A-HJ-NP-Za-hj-km-np-z2-9]{5}){3}$/);
      expect(passwordProblem(p)).toBeNull();
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      seen.add(p);
    }
    expect(seen.size).toBe(300); // never repeats
  });
});

describe("Add member (owner only)", () => {
  it("creates an ACTIVE account at once; the password is shown once with a copy button text and a warning, never chosen by the owner", async () => {
    asOwner();
    const r = await add();
    expect(r).toMatchObject({ ok: expect.stringMatching(/new.member@t.test was added as staff/), copy: { label: "Temporary password (shown once)", button: "Copy password", note: expect.stringMatching(/will NOT be shown again/) } });
    const u = row("new.member@t.test");
    expect(u).toMatchObject({ role: "staff", active: 1, name: "New Member", must_change_password: 1, must_enroll_mfa: 1, totp_enabled: 0 });
    const left = Date.parse(u.temp_password_expires_at) - Date.now();
    expect(left).toBeGreaterThan(47.9 * 3600_000);
    expect(left).toBeLessThanOrEqual(48 * 3600_000);
    expect(r!.copy!.note).toMatch(/48 hours/);
  });

  it("stores only the argon2id HASH: the password appears nowhere in the database files, the audit log or any table", async () => {
    const { password } = await created();
    expect(row("new.member@t.test").password_hash.startsWith("$argon2id$")).toBe(true);
    sql().pragma("wal_checkpoint(FULL)");
    const files = [process.env.DATABASE_PATH!, process.env.DATABASE_PATH! + "-wal"].filter((f) => fs.existsSync(f));
    for (const f of files) expect(fs.readFileSync(f).includes(Buffer.from(password)), f).toBe(false);
    for (const t of ["admin_users", "audit_log", "rate_limits", "sessions", "invites", "password_resets"]) expect(JSON.stringify(sql().prepare(`SELECT * FROM ${t}`).all()), t).not.toContain(password);
  });

  it("the audit log says who created whom, the role and when, and never the password", async () => {
    const { password } = await created({ role: "manager", email: "boss2@t.test" });
    const a = sql().prepare("SELECT actor_id, actor_email, action, entity, entity_id, details, created_at FROM audit_log WHERE action = 'member_created' AND entity = 'admin_user'").get() as Record<string, any>;
    expect(a).toMatchObject({ actor_id: ID.owner, actor_email: "owner@t.test", entity_id: row("boss2@t.test").id });
    expect(a.created_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(JSON.parse(a.details)).toMatchObject({ email: "boss2@t.test", role: "manager", created_by: "owner@t.test" });
    expect(JSON.stringify(a)).not.toContain(password);
    expect(JSON.stringify(sql().prepare("SELECT * FROM audit_log").all())).not.toContain(password);
  });

  it("only the owner: signed out is 401, manager and staff are 403, nothing is created", async () => {
    const { addMember, regenerateTemporaryPasswordAction } = await import("@/app/admin/(app)/settings/team/actions");
    h.user = null;
    await expect(addMember(null, form({ name: "X Y", email: "x@t.test", role: "staff" }))).rejects.toThrow("HTTP_401");
    for (const who of [ID.manager, ID.staff]) {
      h.user = { id: who, email: "x@t.test" };
      await expect(addMember(null, form({ name: "X Y", email: "x@t.test", role: "staff" }))).rejects.toThrow("HTTP_403");
      await expect(regenerateTemporaryPasswordAction(null, form({ id: ID.staff }))).rejects.toThrow("HTTP_403");
    }
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users").get()).toEqual({ n: 3 });
  });

  it("validates name, email and role", async () => {
    asOwner();
    expect(await add({ name: "A" })).toEqual({ error: "Enter their name." });
    expect(await add({ email: "nope" })).toEqual({ error: "Enter a valid email." });
    expect(await add({ role: "superuser" })).toEqual({ error: "Pick a role." });
    expect(await add({ email: "STAFF@t.test" })).toEqual({ error: expect.stringMatching(/already has an account/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users").get()).toEqual({ n: 3 });
  });

  it("a second OWNER needs the typed confirmation CREATE OWNER", async () => {
    asOwner();
    expect(await add({ role: "owner" })).toEqual({ error: expect.stringMatching(/Type CREATE OWNER to confirm/) });
    expect(await add({ role: "owner", confirm_owner: "create owner" })).toEqual({ error: expect.stringMatching(/Type CREATE OWNER/) });
    expect(await add({ role: "owner", confirm_owner: "yes" })).toEqual({ error: expect.stringMatching(/Type CREATE OWNER/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users WHERE role = 'owner'").get()).toEqual({ n: 1 });
    expect(await add({ role: "owner", confirm_owner: "CREATE OWNER" })).toMatchObject({ copy: expect.anything() });
    expect(row("new.member@t.test").role).toBe("owner");
    // manager and staff need no confirmation
    expect(await add({ email: "m@t.test", role: "manager" })).toMatchObject({ copy: expect.anything() });
  });

  it("nobody can grant a role higher than their own", async () => {
    expect(canGrantRole("owner", "owner")).toBe(true);
    expect(canGrantRole("owner", "staff")).toBe(true);
    expect(canGrantRole("manager", "manager")).toBe(true);
    expect(canGrantRole("manager", "staff")).toBe(true);
    expect(canGrantRole("manager", "owner")).toBe(false);
    expect(canGrantRole("staff", "manager")).toBe(false);
    expect(canGrantRole("staff", "owner")).toBe(false);
    expect(canGrantRole(undefined, "staff")).toBe(false);
    expect(canGrantRole("hacker" as never, "staff")).toBe(false);
    await expect(createMember({ actorRole: "manager", email: "x@t.test", name: "X Y", role: "owner" })).rejects.toThrow(MemberError);
    await expect(createMember({ actorRole: "staff", email: "x@t.test", name: "X Y", role: "manager" })).rejects.toThrow(/higher than your own/);
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users").get()).toEqual({ n: 3 });
  });

  it("a pending invite for the same address can no longer overwrite the new account", async () => {
    asOwner();
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    await inviteMember(null, form({ email: "both@t.test", name: "Both", role: "staff" }));
    expect(sql().prepare("SELECT COUNT(*) n FROM invites WHERE email = 'both@t.test' AND used_at IS NULL").get()).toEqual({ n: 1 });
    await add({ email: "both@t.test" });
    expect(sql().prepare("SELECT COUNT(*) n FROM invites WHERE email = 'both@t.test' AND used_at IS NULL").get()).toEqual({ n: 0 });
  });

  it("is rate limited per owner (and the audit trail is kept)", async () => {
    asOwner();
    let last: Res = null;
    for (let i = 0; i < 12; i++) last = await add({ email: `bulk${i}@t.test` });
    expect(last).toEqual({ error: expect.stringMatching(/Too many new members/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'member_created' AND entity = 'admin_user'").get()).toEqual({ n: 10 });
  });

  it("the Invite flow still works next to it", async () => {
    asOwner();
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    expect(await inviteMember(null, form({ email: "invited@t.test", name: "Invited", role: "staff" }))).toMatchObject({ ok: expect.stringMatching(/Invite sent to invited@t.test/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM invites WHERE email = 'invited@t.test'").get()).toEqual({ n: 1 });
    expect(row("invited@t.test")).toBeUndefined(); // an invite creates no account until accepted
  });
});

describe("first login of an added member", () => {
  it("signs in with the temporary password but reaches NOTHING until they choose their own password", async () => {
    const { password, email } = await created();
    expect(await signInWith(email, password)).toEqual({ e: "NEXT_REDIRECT:/admin" });
    const auth = await import("@/lib/auth");
    expect((await auth.getAdminState())?.mustChangePassword).toBe(true);
    expect(await auth.getAdmin()).toBeNull(); // APIs treat a half-signed-in member as signed out
    await expect(auth.requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/change-password");
    const { changeStatus } = await import("@/app/admin/(app)/orders/actions");
    await expect(changeStatus(null, form({}))).rejects.toThrow("NEXT_REDIRECT:/admin/change-password");
    const { GET } = await import("@/app/admin/api/notifications/route");
    expect((await GET()).status).toBe(401);
    const { GET: events } = await import("@/app/admin/api/events/route");
    expect((await events(new Request("https://miel.example/admin/api/events"))).status).toBe(401);
    // not even the maintenance-mode storefront preview
    process.env.SITE_MODE = "maintenance";
    const px = await proxy(new NextRequest("https://miel.example/", { headers: { cookie: `${SESSION_COOKIE}=${jar.get(SESSION_COOKIE)}` } }));
    expect(px.status).toBe(503);
    delete process.env.SITE_MODE;
  });

  it("the new password must be strong, must match, and must differ from the temporary one", async () => {
    const { password, email } = await created();
    await signInWith(email, password);
    const { forceChangePassword } = await import("@/app/admin/(flow)/change-password/actions");
    expect(await forceChangePassword(null, form({ password: "short1", confirm: "short1" }))).toEqual({ error: expect.stringMatching(/at least 12/) });
    expect(await forceChangePassword(null, form({ password: "onlylettersnodigits", confirm: "onlylettersnodigits" }))).toEqual({ error: expect.stringMatching(/letters and numbers/) });
    expect(await forceChangePassword(null, form({ password: "a good long passphrase 55", confirm: "another long passphrase 56" }))).toEqual({ error: expect.stringMatching(/don't match/) });
    expect(await forceChangePassword(null, form({ password, confirm: password }))).toEqual({ error: expect.stringMatching(/different password/) });
    expect(row(email).must_change_password).toBe(1); // nothing changed
  });

  it("choosing a password ends the other sessions, clears the flag and the expiry, and then 2FA enrolment is forced", async () => {
    const { password, email } = await created();
    const other = createSession(row(email).id);
    await signInWith(email, password);
    const { forceChangePassword } = await import("@/app/admin/(flow)/change-password/actions");
    expect(await act(forceChangePassword(null, form({ password: "my very own passphrase 77", confirm: "my very own passphrase 77" })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect(row(email)).toMatchObject({ must_change_password: 0, temp_password_expires_at: null, must_enroll_mfa: 1 });
    expect(lookupSession(other.token).ok).toBe(false);
    expect(row(email).password_hash.startsWith("$argon2id$")).toBe(true);
    expect(sql().prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'password_set' AND actor_email = ?").get(email)).toEqual({ n: 1 });

    // the next gate: two-factor, even though the owner never turned on "require 2FA"
    const auth = await import("@/lib/auth");
    expect(sql().prepare("SELECT COUNT(*) n FROM settings WHERE key = 'security'").get()).toEqual({ n: 0 });
    expect((await auth.getAdminState())?.mfa).toBe("enroll");
    expect(await auth.getAdmin()).toBeNull();
    await expect(auth.requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
    const { changeStatus } = await import("@/app/admin/(app)/orders/actions");
    await expect(changeStatus(null, form({}))).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
    expect((await (await import("@/app/admin/api/notifications/route")).GET()).status).toBe(401);

    // enrol: TOTP + recovery codes
    const { startEnroll, finishEnroll } = await import("@/app/admin/(flow)/mfa/actions");
    const s = await startEnroll();
    if (!s.ok) throw new Error("enroll");
    const fin = await finishEnroll("totp", totpNow(s.secret));
    expect(fin.codes).toHaveLength(10);
    expect(row(email)).toMatchObject({ totp_enabled: 1, must_enroll_mfa: 0 });
    expect((await auth.getAdmin())?.email).toBe(email); // and only now: in
    expect((await auth.getAdminState())?.mfa).toBe("ok");
  });

  it("the change-password page is not an escape hatch: a normal member is sent away, a signed-out visitor to the login", async () => {
    const { forceChangePassword } = await import("@/app/admin/(flow)/change-password/actions");
    h.user = { id: ID.staff, email: "staff@t.test" };
    await expect(forceChangePassword(null, form({ password: "whatever passphrase 12", confirm: "whatever passphrase 12" }))).rejects.toThrow("NEXT_REDIRECT:/admin");
    h.user = null;
    await expect(forceChangePassword(null, form({ password: "whatever passphrase 12", confirm: "whatever passphrase 12" }))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });

  it("wrong temporary-password guesses are rate limited like any login", async () => {
    const { email } = await created();
    const { login } = await import("@/app/admin/login/actions");
    for (let i = 0; i < 5; i++) await login(null, form({ email, password: `guess-${i}-guess-guess` }));
    expect(await login(null, form({ email, password: "Another-guess-77" }))).toEqual({ error: expect.stringMatching(/Too many attempts/) });
  });
});

describe("expiry and regeneration", () => {
  it("the temporary password stops working after 48 hours (same generic message), and so does a session made with it", async () => {
    const { password, email } = await created();
    expect(await signInWith(email, password)).toEqual({ e: "NEXT_REDIRECT:/admin" });
    const token = jar.get(SESSION_COOKIE)!;
    expect(lookupSession(token).ok).toBe(true);
    sql().prepare("UPDATE admin_users SET temp_password_expires_at = ? WHERE email = ?").run(new Date(Date.now() - 60_000).toISOString(), email);
    expect(lookupSession(token)).toEqual({ ok: false, reason: "expired" });
    expect(await signInWith(email, password)).toEqual({ r: { error: "Wrong email or password." } });
    expect(sql().prepare("SELECT details FROM audit_log WHERE action = 'login_failed' ORDER BY created_at DESC").get()).toEqual({ details: expect.stringContaining("temporary_password_expired") });
  });

  it("the owner regenerates it: the old one and the member's sessions die, the new one works, and it is audited without the password", async () => {
    const first = await created();
    const session = createSession(row(first.email).id);
    sql().prepare("UPDATE admin_users SET temp_password_expires_at = ? WHERE email = ?").run(new Date(Date.now() - 1000).toISOString(), first.email); // even an expired one can be regenerated
    asOwner();
    const { regenerateTemporaryPasswordAction } = await import("@/app/admin/(app)/settings/team/actions");
    const r = (await regenerateTemporaryPasswordAction(null, form({ id: row(first.email).id }))) as Res;
    expect(r).toMatchObject({ ok: expect.stringMatching(/old one no longer works/), copy: { label: "Temporary password (shown once)", note: expect.stringMatching(/will NOT be shown again/) } });
    const next = r!.copy!.value;
    expect(next).not.toBe(first.password);
    expect(lookupSession(session.token).ok).toBe(false);
    expect(await signInWith(first.email, first.password)).toEqual({ r: { error: "Wrong email or password." } });
    expect(await signInWith(first.email, next)).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect(Date.parse(row(first.email).temp_password_expires_at) - Date.now()).toBeGreaterThan(47.9 * 3600_000);
    const a = sql().prepare("SELECT actor_email, details FROM audit_log WHERE action = 'member_password_regenerated'").get() as Record<string, string>;
    expect(a.actor_email).toBe("owner@t.test");
    expect(JSON.stringify(sql().prepare("SELECT * FROM audit_log").all())).not.toMatch(new RegExp(`${next}|${first.password}`));
    expect(fs.readFileSync(process.env.DATABASE_PATH!).includes(Buffer.from(next))).toBe(false);
  });

  it("regeneration is refused for yourself, for members who already chose a password, and for deactivated ones", async () => {
    const m = await created();
    asOwner();
    const { regenerateTemporaryPasswordAction: regen } = await import("@/app/admin/(app)/settings/team/actions");
    expect(await regen(null, form({ id: ID.owner }))).toEqual({ error: expect.stringMatching(/My account/) });
    expect(await regen(null, form({ id: ID.staff }))).toEqual({ error: expect.stringMatching(/already chose their own password/) }); // seeded staff is a normal member
    expect(await regen(null, form({ id: "00000000-0000-4000-8000-00000000dead" }))).toEqual({ error: expect.stringMatching(/isn't on the team/) });
    sql().prepare("UPDATE admin_users SET active = 0 WHERE email = ?").run(m.email);
    expect(await regen(null, form({ id: row(m.email).id }))).toEqual({ error: expect.stringMatching(/deactivated/) });
  });

  it("a reset link or invite acceptance also ends the 'must change' state (they chose a password themselves)", async () => {
    const { email } = await created();
    const { createReset, consumeToken } = await import("@/lib/invites");
    await createReset(row(email).id);
    const link = (await import("../support/state")).lastLink(email)!;
    await consumeToken("reset", new URL(link).searchParams.get("token")!, "a reset chosen passphrase 88");
    expect(row(email)).toMatchObject({ must_change_password: 0, temp_password_expires_at: null });
    expect(row(email).must_enroll_mfa).toBe(1); // two-factor is still required
  });
});

describe("existing protections are unchanged", () => {
  it("a deactivated member is locked out at once, an idle session still ends after 12 hours", async () => {
    const { password, email } = await created();
    await signInWith(email, password);
    const token = jar.get(SESSION_COOKIE)!;
    sql().prepare("UPDATE sessions SET last_seen_at = ?").run(new Date(Date.now() - 13 * 3600_000).toISOString());
    expect(lookupSession(token)).toEqual({ ok: false, reason: "expired" });
    await signInWith(email, password);
    sql().prepare("UPDATE admin_users SET active = 0 WHERE email = ?").run(email);
    expect(lookupSession(jar.get(SESSION_COOKIE)!).ok).toBe(false);
  });

  it("there is still no public sign-up: no route and no way to add a member without the owner's session", async () => {
    const routes: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${d}/${e.name}`);
        else if (/(sign-?up|register|join)/i.test(`${d}/${e.name}`)) routes.push(`${d}/${e.name}`);
      }
    };
    walk("app");
    expect(routes).toEqual([]);
    h.user = null;
    const { addMember } = await import("@/app/admin/(app)/settings/team/actions");
    await expect(addMember(null, form({ name: "X Y", email: "x@t.test", role: "staff" }))).rejects.toThrow("HTTP_401");
  });
});
