import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createLocalClient } = await import("../support/local-db");
  return {
    getDb: () => createLocalClient(),
    hasSupabase: () => true,
    dbMode: () => "supabase",
    usesDb: () => true,
    must: (r: any) => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
  };
});
vi.mock("@/lib/supabase-server", async () => {
  const { fakeAuthClient, fakeAdminAuth } = await import("../support/state");
  return { authClient: async () => fakeAuthClient(), adminAuthClient: () => fakeAdminAuth() };
});
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
  forbidden: () => {
    throw new Error("HTTP_403");
  },
  unauthorized: () => {
    throw new Error("HTTP_401");
  },
  notFound: () => {
    throw new Error("HTTP_404");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
}));

import { createLocalClient } from "../support/local-db";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const db = () => createLocalClient() as any;
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const audit = async (action: string) => ((await db().from("audit_log").select("*").eq("action", action)).data as any[]);

beforeEach(async () => {
  resetState();
  await seedStore();
  h.accounts["owner@t.test"] = { id: ID.owner, password: "correct horse battery 7" };
  h.accounts["staff@t.test"] = { id: ID.staff, password: "another long passphrase 9" };
  h.accounts["stranger@t.test"] = { id: ID.stranger, password: "stranger passphrase 12345" };
});

describe("login", () => {
  it("a team member with the right password is signed in and the login is logged", async () => {
    const { login } = await import("@/app/admin/login/actions");
    await expect(login(null, fd({ email: "Owner@T.test", password: "correct horse battery 7" }))).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect((await audit("login")).length).toBe(1);
  });
  it("wrong password, unknown email and a non-team account all get the SAME generic message", async () => {
    const { login } = await import("@/app/admin/login/actions");
    const bad = await login(null, fd({ email: "owner@t.test", password: "nope nope nope 1" }));
    const unknown = await login(null, fd({ email: "nobody@t.test", password: "whatever whatever 1" }));
    const stranger = await login(null, fd({ email: "stranger@t.test", password: "stranger passphrase 12345" }));
    expect(bad).toEqual({ error: "Wrong email or password." });
    expect(unknown).toEqual(bad);
    expect(stranger).toEqual(bad);
    expect(h.calls.signOut.length).toBe(1); // the non-team account's fresh session was ended immediately
  });
  it("a deactivated team member cannot sign in (same generic message)", async () => {
    await db().from("admin_users").update({ active: false }).eq("id", ID.staff);
    const { login } = await import("@/app/admin/login/actions");
    expect(await login(null, fd({ email: "staff@t.test", password: "another long passphrase 9" }))).toEqual({ error: "Wrong email or password." });
  });
  it("failed attempts are audited without storing the email in clear text", async () => {
    const { login } = await import("@/app/admin/login/actions");
    await login(null, fd({ email: "owner@t.test", password: "bad bad bad bad 1" }));
    const rows = await audit("login_failed");
    expect(rows.length).toBe(1);
    expect(rows[0].actor_email).toMatch(/^hash:[0-9a-f]{24}$/);
    expect(JSON.stringify(rows[0])).not.toContain("owner@t.test");
  });
  it("brute force is throttled: after 5 failures even the right password is refused for 15 minutes", async () => {
    const { login } = await import("@/app/admin/login/actions");
    for (let i = 0; i < 5; i++) await login(null, fd({ email: "owner@t.test", password: `wrong wrong ${i} wrong` }));
    const res = await login(null, fd({ email: "owner@t.test", password: "correct horse battery 7" }));
    expect(res).toEqual({ error: "Too many attempts. Wait 15 minutes and try again." });
  });
});

describe("password reset by email", () => {
  it("gives the identical answer for unknown and known addresses, and only emails real team members", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    const unknown = await requestReset(null, fd({ email: "nobody@t.test" }));
    expect(h.calls.resets).toHaveLength(0);
    const known = await requestReset(null, fd({ email: "staff@t.test" }));
    expect(known).toEqual(unknown);
    expect(h.calls.resets).toHaveLength(1);
    expect(h.calls.resets[0].email).toBe("staff@t.test");
    expect(h.calls.resets[0].opts.redirectTo).toContain("/admin/auth/confirm");
    expect((await audit("password_reset_requested")).length).toBe(1);
  });
  it("floods are ignored silently", async () => {
    const { requestReset } = await import("@/app/admin/login/actions");
    for (let i = 0; i < 6; i++) await requestReset(null, fd({ email: "staff@t.test" }));
    expect(h.calls.resets.length).toBeLessThanOrEqual(3);
  });
  it("a deactivated member gets no email", async () => {
    await db().from("admin_users").update({ active: false }).eq("id", ID.staff);
    const { requestReset } = await import("@/app/admin/login/actions");
    await requestReset(null, fd({ email: "staff@t.test" }));
    expect(h.calls.resets).toHaveLength(0);
  });
});

describe("invite flow (mocked Supabase Auth)", () => {
  it("owner invites: Supabase sends the email, NO password is created, the team record is saved", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    const r = await inviteMember(null, fd({ email: "New.Person@T.test", name: "New Person", role: "manager" }));
    expect((r as any).ok).toMatch(/Invite sent/);
    expect(h.calls.invites).toHaveLength(1);
    expect(h.calls.invites[0].email).toBe("new.person@t.test");
    expect(h.calls.invites[0].opts).not.toHaveProperty("password");
    expect(h.calls.invites[0].opts.data).not.toHaveProperty("password");
    expect(h.calls.invites[0].opts.redirectTo).toContain("/admin/auth/confirm");
    const row = (await db().from("admin_users").select("*").eq("email", "new.person@t.test").single()).data;
    expect(row).toMatchObject({ role: "manager", active: true });
    expect((await audit("invite_sent")).length).toBe(1);
  });
  it("cannot invite someone already on the team, or with an invalid role/email", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    expect(await inviteMember(null, fd({ email: "staff@t.test", role: "staff" }))).toMatchObject({ error: expect.stringMatching(/already on the team/) });
    expect(await inviteMember(null, fd({ email: "x@y.z", role: "god" }))).toMatchObject({ error: expect.any(String) });
    expect(await inviteMember(null, fd({ email: "not-an-email", role: "staff" }))).toMatchObject({ error: expect.any(String) });
    expect(h.calls.invites).toHaveLength(0);
  });
  it("a deactivated member is reactivated with a reset link instead of a new invite", async () => {
    await db().from("admin_users").update({ active: false }).eq("id", ID.staff);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { inviteMember } = await import("@/app/admin/(app)/settings/team/actions");
    await inviteMember(null, fd({ email: "staff@t.test", role: "staff" }));
    expect(h.calls.invites).toHaveLength(0);
    expect(h.calls.resets).toHaveLength(1);
    expect((await db().from("admin_users").select("*").eq("id", ID.staff).single()).data.active).toBe(true);
  });
});

describe("accepting an invite / reset link", () => {
  it("a valid token signs the person in and goes to set-password", async () => {
    h.validTokens.add("good-token");
    const { confirmLink } = await import("@/app/admin/auth/confirm/actions");
    await expect(confirmLink(fd({ token_hash: "good-token", type: "invite", next: "/admin/set-password" }))).rejects.toThrow("NEXT_REDIRECT:/admin/set-password");
    expect((await audit("invite_accepted")).length).toBe(1);
  });
  it("a bad or reused token is refused and logged", async () => {
    const { confirmLink } = await import("@/app/admin/auth/confirm/actions");
    await expect(confirmLink(fd({ token_hash: "stolen", type: "recovery" }))).rejects.toThrow("NEXT_REDIRECT:/admin/login?error=link");
    expect((await audit("login_failed")).length).toBe(1);
  });
  it("an unknown link type is refused before touching Supabase", async () => {
    const { confirmLink } = await import("@/app/admin/auth/confirm/actions");
    await expect(confirmLink(fd({ token_hash: "x", type: "magiclink" }))).rejects.toThrow("NEXT_REDIRECT:/admin/login?error=link");
    expect(h.calls.verifyOtp).toHaveLength(0);
  });
  it("cannot be turned into an open redirect", async () => {
    h.validTokens.add("t1");
    const { confirmLink } = await import("@/app/admin/auth/confirm/actions");
    for (const evil of ["https://evil.example", "//evil.example", "/store"])
      await expect(confirmLink(fd({ token_hash: "t1", type: "recovery", next: evil }))).rejects.toThrow("NEXT_REDIRECT:/admin/set-password");
  });
});

describe("choosing a password", () => {
  it("rejects weak or mismatched passwords and accepts a strong one", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    const { setPassword } = await import("@/app/admin/(flow)/set-password/actions");
    expect(await setPassword(null, fd({ password: "short1", confirm: "short1" }))).toMatchObject({ error: expect.stringMatching(/12/) });
    expect(await setPassword(null, fd({ password: "a long passphrase 123", confirm: "different passphrase 1" }))).toMatchObject({ error: expect.stringMatching(/match/) });
    expect(h.calls.updateUser).toHaveLength(0);
    await expect(setPassword(null, fd({ password: "a long passphrase 123", confirm: "a long passphrase 123" }))).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(h.calls.updateUser).toEqual([{ password: "a long passphrase 123" }]);
    expect((await audit("password_set")).length).toBe(1);
  });
  it("needs a session (the link) first", async () => {
    h.user = null;
    const { setPassword } = await import("@/app/admin/(flow)/set-password/actions");
    expect(await setPassword(null, fd({ password: "a long passphrase 123", confirm: "a long passphrase 123" }))).toMatchObject({ error: expect.stringMatching(/expired/) });
    expect(h.calls.updateUser).toHaveLength(0);
  });
  it("changing your own password re-checks the current one", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { changePassword } = await import("@/app/admin/(app)/account/actions");
    expect(await changePassword(null, fd({ current: "wrong wrong wrong 1", password: "a brand new passphrase 5", confirm: "a brand new passphrase 5" }))).toMatchObject({ error: expect.stringMatching(/current password is wrong/) });
    expect(h.calls.updateUser).toHaveLength(0);
    expect(await changePassword(null, fd({ current: "correct horse battery 7", password: "a brand new passphrase 5", confirm: "a brand new passphrase 5" }))).toMatchObject({ ok: expect.any(String) });
    expect(h.calls.updateUser).toHaveLength(1);
  });
});

describe("team safety", () => {
  it("the last active owner cannot be demoted or deactivated, and you cannot deactivate yourself", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { setRole, setActive } = await import("@/app/admin/(app)/settings/team/actions");
    expect(await setRole(null, fd({ id: ID.owner, role: "staff" }))).toMatchObject({ error: expect.stringMatching(/at least one active owner/) });
    expect(await setActive(null, fd({ id: ID.owner, active: "0" }))).toMatchObject({ error: expect.stringMatching(/yourself/) });
    expect((await db().from("admin_users").select("*").eq("id", ID.owner).single()).data).toMatchObject({ role: "owner", active: true });
  });
  it("role changes are audited with before and after", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { setRole } = await import("@/app/admin/(app)/settings/team/actions");
    await setRole(null, fd({ id: ID.staff, role: "manager" }));
    const [row] = await audit("role_change");
    expect(row.details).toMatchObject({ from: "staff", to: "manager" });
  });
  it("a deactivated member is locked out on their very next request", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { setActive } = await import("@/app/admin/(app)/settings/team/actions");
    await setActive(null, fd({ id: ID.staff, active: "0" }));
    h.user = { id: ID.staff, email: "staff@t.test" };
    const orders = await import("@/app/admin/(app)/orders/actions");
    await expect(orders.changeStatus(null, new FormData())).rejects.toThrow("HTTP_401");
  });
});

describe("tampered ids and crafted requests do not crash or leak", () => {
  it("unknown ids return a clean error", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const orders = await import("@/app/admin/(app)/orders/actions");
    const r = await orders.changeStatus(null, fd({ id: "00000000-0000-0000-0000-00000000dead", to: "confirmed" }));
    expect(r).toMatchObject({ error: expect.any(String) });
    expect(await orders.changeStatus(null, fd({ id: "1; drop table orders", to: "confirmed" }))).toMatchObject({ error: expect.any(String) });
    expect(await orders.changeStatus(null, fd({ id: ID.owner, to: "superuser" }))).toMatchObject({ error: "Unknown status." });
  });
});
