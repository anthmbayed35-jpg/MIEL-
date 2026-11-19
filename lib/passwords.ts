import argon2 from "argon2";

/** Passwords are hashed with argon2id (memory-hard). Only the hash is stored; it carries its own salt and parameters. */
export const PASSWORD_MIN = 12;

export function passwordProblem(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > 128) return "That password is too long.";
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return "Mix letters and numbers (a passphrase of several words works well).";
  return null;
}

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

let dummy: Promise<string> | undefined;

/**
 * Verify a password. With no stored hash (unknown email, invited-but-not-accepted) a throwaway hash is verified so the
 * response time does not reveal whether the account exists.
 */
export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummy ??= hashPassword("not-a-real-password-for-timing-only");
    await argon2.verify(await dummy, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
