import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { hashPassword } from "@/lib/passwords";
import { createSession, destroyUserSessions, listSessions, lookupSession, IDLE_MS, ABSOLUTE_MS, SESSION_COOKIE } from "@/lib/session";
import { consumeToken, createReset, peekToken, INVITE_TTL_MS, RESET_TTL_MS } from "@/lib/invites";
import { newSecret, totpNow, verifyTotp, stepOf } from "@/lib/totp";
import { decrypt } from "@/lib/crypto";
import { jar, h, ID, lastLink, outbox, reqHeaders, resetState, TEST_PASSWORD } from "../support/state";
import { seedStore } from "../support/seed";

const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function withPassword(id: string, pw = TEST_PASSWORD) {
  sql().prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(await hashPassword(pw), id);
}
const act = async (p: Promise<unknown>) => p.then((r) => ({ r }), (e: Error) => ({ e: e.message }));

beforeEach(async () => {
  resetState();
  await seedStore();
  reqHeaders["x-forwarded-for"] = "5.5.5.5";
});

describe("login", () => {
  it("right password: a database session is created and the cookie holds a token whose HASH is stored", async () => {
    await withPassword(ID.staff);
    const { login } = await import("@/app/admin/login/actions");
    expect(await act(login(null, form({ email: "STAFF@t.test", password: TEST_PASSWORD })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    const token = jar.get(SESSION_COOKIE)!;
    expect(token.length).toBeGreaterThan(30);
    const row = sql().prepare("SELECT id, user_id, mfa_ok FROM sessions").get() as { id: string; user_id: string; mfa_ok: number };
    expect(row.user_id).toBe(ID.staff);
    expect(row.id).toBe(sha(token)); // only the hash is in the database
    expect(row.id).not.toBe(token);
    expect(row.mfa_ok).toBe(0);
  });

  it("wrong password, unknown email and inactive account all get the same message", async () => {
    await withPassword(ID.staff);
    await withPassword(ID.manager);
    sql().prepare("UPDATE admin_users SET active = 0 WHERE id = ?").run(ID.manager);
    const { login } = await import("@/app/admin/login/actions");
    const bad = await act(login(null, form({ email: "staff@t.test", password: "wrong-password-1" })));
    const none = await act(login(null, form({ email: "nobody@t.test", password: "wrong-password-1" })));
    const off = await act(login(null, form({ email: "manager@t.test", password: TEST_PASSWORD })));
    expect(bad).toEqual({ r: { error: "Wrong email or password." } });
    expect(none).toEqual(bad);
    expect(off).toEqual(bad);
    expect(sql().prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 });
  });

  it("an invited person who has not chosen a password yet cannot sign in with anything", async () => {
    const { login } = await import("@/app/admin/login/actions");
    expect(await act(login(null, form({ email: "staff@t.test", password: "" })))).toEqual({ r: { error: "Wrong email or password." } });
    expect(await act(login(null, form({ email: "staff@t.test", password: "anything-at-all-123" })))).toEqual({ r: { error: "Wrong email or password." } });
  });

  it("rate limit: after 5 failures the email is locked even with the right password (stored in the database)", async () => {
    await withPassword(ID.staff);
    const { login } = await import("@/app/admin/login/actions");
    for (let i = 0; i < 5; i++) await login(null, form({ email: "staff@t.test", password: `wrong-${i}-password` }));
    const locked = await login(null, form({ email: "staff@t.test", password: TEST_PASSWORD }));
    expect(locked?.error).toMatch(/Too many attempts/);
    expect(sql().prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 });
    // the counter lives in the database, so it survives a restart (a new connection sees it)
    expect((sql().prepare("SELECT COUNT(*) n FROM rate_limits WHERE key LIKE 'login_failed:%'").get() as { n: number }).n).toBeGreaterThan(0);
  });

  it("the audit log records logins and failed logins without the raw email", async () => {
    await withPassword(ID.staff);
    const { login } = await import("@/app/admin/login/actions");
    await login(null, form({ email: "staff@t.test", password: "wrong-password-xyz" }));
    await act(login(null, form({ email: "staff@t.test", password: TEST_PASSWORD })));
    const rows = sql().prepare("SELECT action, actor_email, entity_id FROM audit_log ORDER BY created_at").all() as { action: string; actor_email: string; entity_id: string }[];
    expect(rows.map((r) => r.action)).toEqual(["login_failed", "login"]);
    expect(rows[0].actor_email).toMatch(/^hash:[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toContain("5.5.5.5"); // IPs are hashed too
  });
});

describe("sessions", () => {
  it("12 hour idle timeout: a session unused for 12 h is ended, one used within it lives on", () => {
    const { token } = createSession(ID.staff);
    const t0 = Date.now();
    expect(lookupSession(token, t0 + IDLE_MS - 60_000).ok).toBe(true);
    const idle = lookupSession(token, t0 + IDLE_MS - 60_000 + IDLE_MS + 1000);
    expect(idle).toEqual({ ok: false, reason: "expired" });
    expect(sql().prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 }); // and it is gone
  });
  it("activity keeps a session alive, up to the 7 day hard limit", () => {
    const { token } = createSession(ID.staff);
    const t0 = Date.now();
    let t = t0;
    for (let i = 0; i < 10; i++) {
      t += 10 * 60 * 60 * 1000;
      expect(lookupSession(token, t).ok).toBe(true); // used every 10 hours
    }
    expect(lookupSession(token, t0 + ABSOLUTE_MS + 1000)).toEqual({ ok: false, reason: "expired" });
  });
  it("a deactivated person's sessions stop working immediately", () => {
    const { token } = createSession(ID.staff);
    sql().prepare("UPDATE admin_users SET active = 0 WHERE id = ?").run(ID.staff);
    expect(lookupSession(token).ok).toBe(false);
  });
  it("garbage tokens never match", () => {
    for (const t of ["", "a", "x".repeat(300), "../../etc/passwd", "' OR 1=1 --"]) expect(lookupSession(t).ok).toBe(false);
  });
  it("sign out everywhere ends every session of that person only; the list shows them", async () => {
    const a = createSession(ID.staff, { ip: "1.1.1.1", userAgent: "Phone" });
    const b = createSession(ID.staff, { ip: "2.2.2.2", userAgent: "Laptop" });
    const other = createSession(ID.manager);
    expect(listSessions(ID.staff, a.token).map((s) => [s.userAgent, s.current]).sort()).toEqual([["Laptop", false], ["Phone", true]]);
    h.user = { id: ID.staff, email: "staff@t.test" };
    const { logoutEverywhere } = await import("@/app/admin/login/actions");
    expect(await act(logoutEverywhere())).toEqual({ e: "NEXT_REDIRECT:/admin/login" });
    expect(lookupSession(a.token).ok).toBe(false);
    expect(lookupSession(b.token).ok).toBe(false);
    expect(lookupSession(other.token).ok).toBe(true);
  });
  it("revoking one session works only on your own sessions", async () => {
    const mine = createSession(ID.staff);
    const theirs = createSession(ID.manager);
    h.user = { id: ID.staff, email: "staff@t.test" };
    const { revokeSession } = await import("@/app/admin/(app)/account/actions");
    expect(await revokeSession(null, form({ id: sha(theirs.token) }))).toEqual({ error: "That session is already gone." });
    expect(lookupSession(theirs.token).ok).toBe(true);
    expect(await revokeSession(null, form({ id: sha(h.token!) }))).toEqual({ error: expect.stringMatching(/this browser/) });
    expect(await revokeSession(null, form({ id: sha(mine.token) }))).toEqual({ ok: "Signed out." }); // my other device
    expect(lookupSession(mine.token).ok).toBe(false);
  });
  it("changing your password signs your other devices out", async () => {
    await withPassword(ID.staff);
    const other = createSession(ID.staff);
    h.user = { id: ID.staff, email: "staff@t.test" };
    const { changePassword } = await import("@/app/admin/(app)/account/actions");
    expect(await changePassword(null, form({ current: "nope-nope-nope-1", password: "a brand new passphrase 77", confirm: "a brand new passphrase 77" }))).toEqual({ error: "Your current password is wrong." });
    expect(await changePassword(null, form({ current: TEST_PASSWORD, password: "a brand new passphrase 77", confirm: "a brand new passphrase 77" }))).toMatchObject({ ok: expect.stringMatching(/changed/) });
    expect(lookupSession(other.token).ok).toBe(false);
    expect(lookupSession(h.token).ok).toBe(true);
  });
});

describe("invites", () => {
  const invite = async (email = "new.person@t.test", role: "owner" | "manager" | "staff" = "staff") => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    return inviteMember(null, form({ email, name: "New Person", role }));
  };

  it("the owner invites: an email with a link on NEXT_PUBLIC_SITE_URL goes out, only a HASH of the token is stored, nobody exists yet", async () => {
    expect(await invite()).toMatchObject({ ok: expect.stringMatching(/Invite sent/) });
    const link = lastLink("new.person@t.test")!;
    expect(link.startsWith("https://miel.example/admin/set-password?type=invite&token=")).toBe(true);
    const token = tokenOf(link);
    const row = sql().prepare("SELECT token_hash, used_at FROM invites").get() as { token_hash: string; used_at: string | null };
    expect(row.token_hash).toBe(sha(token));
    expect(JSON.stringify(sql().prepare("SELECT * FROM invites").all())).not.toContain(token);
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users WHERE email = 'new.person@t.test'").get()).toEqual({ n: 0 });
  });

  it("accepting: the person chooses a password (argon2id), is created with the invited role and signed in; the link works once", async () => {
    await invite("new.person@t.test", "manager");
    const token = tokenOf(lastLink("new.person@t.test")!);
    expect(peekToken("invite", token)).toMatchObject({ email: "new.person@t.test" });
    const { setPassword } = await import("@/app/admin/(flow)/set-password/actions");
    jar.clear();
    expect(await act(setPassword(null, form({ type: "invite", token, password: "my own long passphrase 42", confirm: "my own long passphrase 42" })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    const u = sql().prepare("SELECT role, active, password_hash FROM admin_users WHERE email = 'new.person@t.test'").get() as { role: string; active: number; password_hash: string };
    expect(u.role).toBe("manager");
    expect(u.active).toBe(1);
    expect(u.password_hash.startsWith("$argon2id$")).toBe(true);
    expect(lookupSession(jar.get(SESSION_COOKIE)).ok).toBe(true);
    // second use of the same link
    jar.clear();
    expect(await setPassword(null, form({ type: "invite", token, password: "another long passphrase 43", confirm: "another long passphrase 43" }))).toEqual({ error: expect.stringMatching(/expired or was already used/) });
    expect(peekToken("invite", token)).toBeNull();
  });

  it("opening the page (peek) does not use the token up, so email link scanners are harmless", async () => {
    await invite();
    const token = tokenOf(lastLink("new.person@t.test")!);
    for (let i = 0; i < 3; i++) expect(peekToken("invite", token)).not.toBeNull();
  });

  it("an invite expires after 48 hours", async () => {
    await invite();
    const token = tokenOf(lastLink("new.person@t.test")!);
    expect(peekToken("invite", token, Date.now() + INVITE_TTL_MS - 60_000)).not.toBeNull();
    expect(peekToken("invite", token, Date.now() + INVITE_TTL_MS + 60_000)).toBeNull();
    await expect(consumeToken("invite", token, "a long enough passphrase 1", Date.now() + INVITE_TTL_MS + 60_000)).rejects.toThrow(/expired/);
  });

  it("a new invite to the same address cancels the older link", async () => {
    await invite();
    const first = tokenOf(lastLink("new.person@t.test")!);
    await invite();
    const second = tokenOf(lastLink("new.person@t.test")!);
    expect(peekToken("invite", first)).toBeNull();
    expect(peekToken("invite", second)).not.toBeNull();
  });

  it("two people racing on the same link: exactly one wins", async () => {
    await invite();
    const token = tokenOf(lastLink("new.person@t.test")!);
    const r = await Promise.allSettled([consumeToken("invite", token, "first long passphrase 11"), consumeToken("invite", token, "second long passphrase 22")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(sql().prepare("SELECT COUNT(*) n FROM admin_users WHERE email = 'new.person@t.test'").get()).toEqual({ n: 1 });
  });

  it("refuses someone who is already on the team, a bad role, and a bad email; staff cannot invite at all", async () => {
    expect(await invite("staff@t.test")).toEqual({ error: "That person is already on the team." });
    expect(await invite("x@t.test", "superuser" as never)).toEqual({ error: "Pick a role." });
    expect(await invite("not-an-email")).toEqual({ error: "Enter a valid email." });
    h.user = { id: ID.staff, email: "staff@t.test" };
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    await expect(inviteMember(null, form({ email: "a@t.test", role: "owner" }))).rejects.toThrow("HTTP_403");
  });

  it("fails loudly (and creates nothing) when email is not configured in production", async () => {
    process.env.MAIL_PROVIDER = "brevo";
    delete process.env.BREVO_API_KEY;
    delete process.env.MAIL_FROM;
    process.env.MIEL_ENV = "production";
    try {
      const r = await invite("loud@t.test");
      expect(r).toEqual({ error: expect.stringMatching(/Email isn't set up/) });
      expect(sql().prepare("SELECT COUNT(*) n FROM invites").get()).toEqual({ n: 0 });
    } finally {
      delete process.env.MIEL_ENV;
    }
  });

  it("invites are rate limited per owner", async () => {
    let last: unknown;
    for (let i = 0; i < 12; i++) last = await invite(`bulk${i}@t.test`);
    expect(last).toEqual({ error: expect.stringMatching(/Too many invites/) });
  });
});

describe("password reset", () => {
  it("emails a link (on NEXT_PUBLIC_SITE_URL) valid once for 1 hour; using it ends every old session", async () => {
    await withPassword(ID.staff);
    const old = createSession(ID.staff);
    const { requestReset } = await import("@/app/admin/login/actions");
    expect(await requestReset(null, form({ email: "staff@t.test" }))).toMatchObject({ ok: expect.stringMatching(/reset link is on its way/) });
    const link = lastLink("staff@t.test")!;
    expect(link.startsWith("https://miel.example/admin/set-password?type=reset&token=")).toBe(true);
    const token = tokenOf(link);
    expect(peekToken("reset", token, Date.now() + RESET_TTL_MS + 1000)).toBeNull(); // expires in 1 h
    const { setPassword } = await import("@/app/admin/(flow)/set-password/actions");
    expect(await act(setPassword(null, form({ type: "reset", token, password: "a fresh long passphrase 55", confirm: "a fresh long passphrase 55" })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect(lookupSession(old.token).ok).toBe(false);
    jar.clear();
    expect(await setPassword(null, form({ type: "reset", token, password: "a third long passphrase 66", confirm: "a third long passphrase 66" }))).toEqual({ error: expect.stringMatching(/expired or was already used/) });
    // the new password works, the old one does not
    const { login } = await import("@/app/admin/login/actions");
    expect(await act(login(null, form({ email: "staff@t.test", password: "a fresh long passphrase 55" })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
  });
  it("the same answer for known and unknown addresses, and no email for unknown ones", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    const a = await requestReset(null, form({ email: "staff@t.test" }));
    const b = await requestReset(null, form({ email: "ghost@t.test" }));
    expect(a).toEqual(b);
    expect(outbox().map((m) => m.to)).toEqual(["staff@t.test"]);
  });
  it("a reset token is not an invite token (kinds are separate)", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    await requestReset(null, form({ email: "staff@t.test" }));
    const token = tokenOf(lastLink("staff@t.test")!);
    expect(peekToken("invite", token)).toBeNull();
    await expect(consumeToken("invite", token, "some long passphrase 123")).rejects.toThrow();
  });
  it("reset requests are rate limited", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    for (let i = 0; i < 8; i++) await requestReset(null, form({ email: "staff@t.test" }));
    expect(outbox().filter((m) => m.to === "staff@t.test").length).toBeLessThanOrEqual(3);
  });
  it("a weak or mismatched password is refused and the link is NOT used up", async () => {
    await createReset(ID.staff);
    const token = tokenOf(lastLink("staff@t.test")!);
    const { setPassword } = await import("@/app/admin/(flow)/set-password/actions");
    expect(await setPassword(null, form({ type: "reset", token, password: "short1", confirm: "short1" }))).toEqual({ error: expect.stringMatching(/at least 12/) });
    expect(await setPassword(null, form({ type: "reset", token, password: "a long passphrase 123", confirm: "different long passphrase 1" }))).toEqual({ error: expect.stringMatching(/don't match/) });
    expect(peekToken("reset", token)).not.toBeNull();
  });
});

describe("two-factor authentication (TOTP + recovery codes)", () => {
  async function enroll(): Promise<{ secret: string; codes: string[] }> {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { startEnroll, finishEnroll } = await import("@/app/admin/(flow)/mfa/actions");
    const s = await startEnroll();
    if (!s.ok) throw new Error(s.error);
    expect(s.qr.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const r = await finishEnroll("totp", totpNow(s.secret));
    expect(r.ok).toBeTruthy();
    return { secret: s.secret, codes: r.codes! };
  }

  it("enrolment stores the secret ENCRYPTED, returns 10 recovery codes once, and stores only their hashes", async () => {
    const { secret, codes } = await enroll();
    expect(codes).toHaveLength(10);
    const u = sql().prepare("SELECT totp_secret, totp_enabled, recovery_codes FROM admin_users WHERE id = ?").get(ID.owner) as { totp_secret: string; totp_enabled: number; recovery_codes: string };
    expect(u.totp_enabled).toBe(1);
    expect(u.totp_secret).not.toContain(secret);
    expect(decrypt(u.totp_secret)).toBe(secret);
    expect(u.recovery_codes).not.toContain(codes[0]);
    expect(JSON.parse(u.recovery_codes)).toHaveLength(10);
  });

  it("a wrong code does not enable it", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { startEnroll, finishEnroll } = await import("@/app/admin/(flow)/mfa/actions");
    await startEnroll();
    expect(await finishEnroll("totp", "000000")).toEqual({ error: expect.stringMatching(/didn't match/) });
    expect(sql().prepare("SELECT totp_enabled FROM admin_users WHERE id = ?").get(ID.owner)).toEqual({ totp_enabled: 0 });
  });

  it("after enrolment a NEW session must verify before it counts as signed in; a code works once (no replay)", async () => {
    const { secret } = await enroll();
    // a fresh sign-in (new session, 2FA not yet verified)
    h.user = { id: ID.owner, email: "owner@t.test" };
    const auth = await import("@/lib/auth");
    expect(await auth.getAdmin()).toBeNull();
    expect((await auth.getAdminState())?.mfa).toBe("verify");
    const { verifyLogin } = await import("@/app/admin/(flow)/mfa/actions");
    expect(await verifyLogin(null, form({ code: "123456" }))).toEqual({ error: expect.stringMatching(/didn't match/) });
    // the code used during enrolment was already consumed (replay protection): use the NEXT step's code
    const next = totpNow(secret, Date.now() + 30_000);
    expect(await act(verifyLogin(null, form({ code: next })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect((await auth.getAdmin())?.role).toBe("owner");
    // same code again in another session is refused
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await verifyLogin(null, form({ code: next }))).toEqual({ error: expect.stringMatching(/didn't match/) });
  });

  it("recovery codes: each works exactly once, case/dash-insensitive; wrong ones don't", async () => {
    const { codes } = await enroll();
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { verifyLogin } = await import("@/app/admin/(flow)/mfa/actions");
    expect(await verifyLogin(null, form({ code: "aaaaa-bbbbb" }))).toEqual({ error: expect.stringMatching(/didn't match/) });
    expect(await act(verifyLogin(null, form({ code: codes[0].toUpperCase() })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect(JSON.parse((sql().prepare("SELECT recovery_codes FROM admin_users WHERE id = ?").get(ID.owner) as { recovery_codes: string }).recovery_codes)).toHaveLength(9);
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await verifyLogin(null, form({ code: codes[0] }))).toEqual({ error: expect.stringMatching(/didn't match/) }); // used up
    expect(await act(verifyLogin(null, form({ code: codes[1].replace("-", "") })))).toEqual({ e: "NEXT_REDIRECT:/admin" });
    expect(sql().prepare("SELECT action FROM audit_log WHERE action = 'recovery_code_used'").all()).toHaveLength(2);
  });

  it("wrong codes are rate limited", async () => {
    await enroll();
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { verifyLogin } = await import("@/app/admin/(flow)/mfa/actions");
    for (let i = 0; i < 6; i++) await verifyLogin(null, form({ code: "000000" }));
    expect(await verifyLogin(null, form({ code: "000000" }))).toEqual({ error: expect.stringMatching(/Too many wrong codes/) });
  });

  it("new recovery codes replace the old ones", async () => {
    const { codes } = await enroll();
    sql().prepare("UPDATE sessions SET mfa_ok = 1").run();
    const { regenerateRecoveryCodes } = await import("@/app/admin/(flow)/mfa/actions");
    const r = await regenerateRecoveryCodes();
    expect(r.codes).toHaveLength(10);
    expect(r.codes).not.toContain(codes[0]);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { verifyLogin } = await import("@/app/admin/(flow)/mfa/actions");
    expect(await verifyLogin(null, form({ code: codes[0] }))).toEqual({ error: expect.stringMatching(/didn't match/) });
  });

  it("the owner can ENFORCE 2FA: people without it are sent to set it up, and cannot turn it off", async () => {
    sql().prepare("INSERT INTO settings (key, value) VALUES ('security', ?)").run(JSON.stringify({ require_2fa: true }));
    h.user = { id: ID.staff, email: "staff@t.test" };
    const auth = await import("@/lib/auth");
    expect(await auth.getAdmin()).toBeNull();
    await expect(auth.requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
    expect((await auth.getAdminState())?.mfa).toBe("enroll");
    const { startEnroll, finishEnroll, disableMfa } = await import("@/app/admin/(flow)/mfa/actions");
    const s = await startEnroll();
    if (!s.ok) throw new Error("enroll");
    expect((await finishEnroll("totp", totpNow(s.secret))).ok).toBeTruthy();
    expect((await auth.getAdminState())?.mfa).toBe("ok");
    expect(await disableMfa(null, form({}))).toEqual({ error: expect.stringMatching(/requires two-factor/) });
  });

  it("the owner can reset a teammate's 2FA (lost phone and codes), which also signs them out", async () => {
    await enroll();
    const staffSession = createSession(ID.staff);
    h.user = { id: ID.owner, email: "owner@t.test" };
    sql().prepare("UPDATE sessions SET mfa_ok = 1").run();
    const { resetMfa } = await import("@/app/admin/(app)/settings/team/actions");
    sql().prepare("UPDATE admin_users SET totp_enabled = 1, totp_secret = 'x' WHERE id = ?").run(ID.staff);
    expect(await resetMfa(null, form({ id: ID.staff }))).toMatchObject({ ok: expect.stringMatching(/removed/) });
    expect(sql().prepare("SELECT totp_enabled, totp_secret FROM admin_users WHERE id = ?").get(ID.staff)).toEqual({ totp_enabled: 0, totp_secret: null });
    expect(lookupSession(staffSession.token).ok).toBe(false);
  });

  it("TOTP math: RFC 6238 vector, clock drift of one step is accepted, two steps is not", () => {
    // RFC 6238 appendix B, SHA-1 secret "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), T=59s -> 94287082 (8 digits), last 6 = 287082
    expect(totpNow("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
    const secret = newSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpNow(secret, now), 0, now)).toBe(stepOf(now));
    expect(verifyTotp(secret, totpNow(secret, now - 30_000), 0, now)).toBe(stepOf(now) - 1);
    expect(verifyTotp(secret, totpNow(secret, now - 90_000), 0, now)).toBeNull();
    expect(verifyTotp(secret, totpNow(secret, now), stepOf(now), now)).toBeNull(); // replay
    expect(verifyTotp(secret, "12345", 0, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", 0, now)).toBeNull();
  });
});

describe("logout", () => {
  it("deletes this session and the cookie", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    const token = h.token!;
    const { logout } = await import("@/app/admin/login/actions");
    expect(await act(logout())).toEqual({ e: "NEXT_REDIRECT:/admin/login" });
    expect(lookupSession(token).ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    void destroyUserSessions;
  });
});
