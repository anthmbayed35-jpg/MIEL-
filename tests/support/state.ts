import { resetLocalDb } from "./local-db";

/** Shared, mutable state behind the mocked Supabase Auth. Tests set `user` / `aal` to act as someone. */
export const h = {
  user: null as null | { id: string; email: string },
  aal: { currentLevel: "aal1", nextLevel: "aal1" },
  factors: { totp: [] as { id: string }[], all: [] as { id: string; factor_type: string; status: string }[] },
  /** email -> password, for signInWithPassword */
  accounts: {} as Record<string, { id: string; password: string }>,
  validTokens: new Set<string>(),
  calls: {
    signIn: [] as unknown[],
    signOut: [] as unknown[],
    resets: [] as { email: string; opts: any }[],
    invites: [] as { email: string; opts: any }[],
    verifyOtp: [] as unknown[],
    updateUser: [] as { password?: string }[],
  },
};

export function resetState() {
  h.user = null;
  h.aal = { currentLevel: "aal1", nextLevel: "aal1" };
  h.factors = { totp: [], all: [] };
  h.accounts = {};
  h.validTokens = new Set();
  for (const k of Object.keys(h.calls) as (keyof typeof h.calls)[]) h.calls[k].length = 0;
  resetLocalDb();
}

export const ID = {
  owner: "00000000-0000-0000-0000-0000000000a1",
  manager: "00000000-0000-0000-0000-0000000000a2",
  staff: "00000000-0000-0000-0000-0000000000a3",
  stranger: "00000000-0000-0000-0000-0000000000ff",
};

/** Mock of the Supabase auth client used by lib/auth.ts, login actions, proxy, etc. */
export function fakeAuthClient() {
  return {
    auth: {
      getUser: async () => (h.user ? { data: { user: h.user }, error: null } : { data: { user: null }, error: { message: "no session" } }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        h.calls.signIn.push(email);
        const a = h.accounts[email];
        if (!a || a.password !== password) return { data: { user: null }, error: { message: "Invalid login credentials" } };
        h.user = { id: a.id, email };
        return { data: { user: { id: a.id, email } }, error: null };
      },
      signOut: async (o?: unknown) => {
        h.calls.signOut.push(o ?? null);
        h.user = null;
        return { error: null };
      },
      resetPasswordForEmail: async (email: string, opts: unknown) => {
        h.calls.resets.push({ email, opts });
        return { error: null };
      },
      verifyOtp: async (p: { token_hash: string; type: string }) => {
        h.calls.verifyOtp.push(p);
        if (!h.validTokens.has(p.token_hash)) return { data: { user: null }, error: { message: "Token has expired or is invalid" } };
        return { data: { user: { id: ID.staff, email: "staff@t.test" } }, error: null };
      },
      updateUser: async (p: { password?: string }) => {
        h.calls.updateUser.push(p);
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: h.aal, error: null }),
        listFactors: async () => ({ data: h.factors, error: null }),
      },
    },
  };
}

export function fakeAdminAuth() {
  return {
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, opts: unknown) => {
          h.calls.invites.push({ email, opts });
          return { data: { user: { id: `00000000-0000-0000-0000-${String(h.calls.invites.length).padStart(12, "0")}` } }, error: null };
        },
      },
    },
  };
}
