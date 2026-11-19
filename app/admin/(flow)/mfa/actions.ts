"use server";

import { redirect } from "next/navigation";
import { getAdminState, sessionToken } from "@/lib/auth";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { getEngine } from "@/lib/db";
import { markMfaOk } from "@/lib/session";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import { newRecoveryCodes, newSecret, normalizeRecovery, otpauthUri, qrSvgDataUrl, verifyTotp } from "@/lib/totp";
import type { ActionState } from "@/components/admin/ActionForm";

export type EnrollStart = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };
export type EnrollResult = { ok?: string; error?: string; codes?: string[] };

const sql = () => getEngine().sqlite;

/** Begin TOTP setup: returns the QR code and secret to scan. Any half-finished earlier attempt is replaced. */
export async function startEnroll(): Promise<EnrollStart> {
  const st = await getAdminState();
  if (!st) return { ok: false, error: "Sign in first." };
  if (st.totpEnabled) return { ok: false, error: "Two-factor authentication is already on." };
  // Idempotent: a half-finished setup keeps ITS secret, so a repeated call (double click, two tabs, a retry) can never leave
  // the screen showing a different secret than the one the server will check.
  const pending = sql().prepare("SELECT totp_secret FROM admin_users WHERE id = ? AND totp_enabled = 0").get(st.admin.id) as { totp_secret: string | null } | undefined;
  let secret = pending?.totp_secret ? decrypt(pending.totp_secret) : "";
  if (!secret) {
    secret = newSecret();
    sql().prepare("UPDATE admin_users SET totp_secret = ?, totp_enabled = 0, totp_last_step = 0 WHERE id = ?").run(encrypt(secret), st.admin.id);
  }
  return { ok: true, factorId: "totp", qr: await qrSvgDataUrl(otpauthUri(secret, st.admin.email)), secret };
}

/** Confirm the first code from the authenticator app to finish enrolment. Returns the one-time recovery codes (shown once). */
export async function finishEnroll(_factorId: string, code: string): Promise<EnrollResult> {
  const st = await getAdminState();
  if (!st) return { error: "Sign in first." };
  const ip = await clientIp();
  if (await isThrottled("mfa_failed", ip, st.admin.email)) return { error: "Too many wrong codes. Wait 15 minutes." };
  const row = sql().prepare("SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ?").get(st.admin.id) as { totp_secret: string | null; totp_enabled: number };
  if (!row.totp_secret || row.totp_enabled) return { error: "Start the setup again." };
  const step = verifyTotp(decrypt(row.totp_secret), code);
  if (step === null) {
    await recordAuthEvent("mfa_failed", { ip, email: st.admin.email, actorId: st.admin.id, actorEmail: st.admin.email });
    return { error: "That code didn't match. Check the time on your phone and try the next code." };
  }
  const rc = newRecoveryCodes();
  sql().prepare("UPDATE admin_users SET totp_enabled = 1, must_enroll_mfa = 0, totp_last_step = ?, recovery_codes = ?, version = version + 1 WHERE id = ?").run(step, JSON.stringify(rc.hashes), st.admin.id);
  const token = await sessionToken();
  if (token) markMfaOk(token); // they just proved the code, no second prompt
  await recordAuthEvent("mfa_enabled", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  return { ok: "Two-factor authentication is on. Save your recovery codes now: they are shown only once.", codes: rc.plain };
}

/** Second step of sign-in for people who have 2FA: an authenticator code, or one of the one-time recovery codes. */
export async function verifyLogin(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st) redirect("/admin/login");
  const ip = await clientIp();
  if (await isThrottled("mfa_failed", ip, st.admin.email)) return { error: "Too many wrong codes. Wait 15 minutes." };
  const input = String(fd.get("code") ?? "").trim();
  const row = sql().prepare("SELECT totp_secret, totp_last_step, recovery_codes FROM admin_users WHERE id = ?").get(st.admin.id) as { totp_secret: string | null; totp_last_step: number; recovery_codes: string };
  if (!row.totp_secret) return { error: "No authenticator found. Ask the owner to reset your two-factor setup." };

  let ok = false;
  if (/^\d{3}\s?\d{3}$/.test(input)) {
    const step = verifyTotp(decrypt(row.totp_secret), input, row.totp_last_step);
    if (step !== null) {
      // the guarded UPDATE makes a code unusable twice even if two requests race
      ok = sql().prepare("UPDATE admin_users SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?").run(step, st.admin.id, step).changes === 1;
    }
  } else {
    const h = sha256(normalizeRecovery(input));
    const codes: string[] = JSON.parse(row.recovery_codes);
    if (codes.includes(h)) {
      const left = codes.filter((c) => c !== h);
      ok = sql().prepare("UPDATE admin_users SET recovery_codes = ? WHERE id = ? AND recovery_codes = ?").run(JSON.stringify(left), st.admin.id, row.recovery_codes).changes === 1;
      if (ok) await recordAuthEvent("recovery_code_used", { ip, actorId: st.admin.id, actorEmail: st.admin.email, details: { remaining: left.length } });
    }
  }
  if (!ok) {
    await recordAuthEvent("mfa_failed", { ip, email: st.admin.email, actorId: st.admin.id, actorEmail: st.admin.email });
    return { error: "That code didn't match. Try the next one, or use a recovery code." };
  }
  const token = await sessionToken();
  if (token) markMfaOk(token);
  await recordAuthEvent("mfa_verified", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  redirect("/admin");
}

/** Replace the recovery codes with 10 new ones (needs a fully signed-in session). */
export async function regenerateRecoveryCodes(): Promise<EnrollResult> {
  const st = await getAdminState();
  if (!st || st.mfa !== "ok" || !st.totpEnabled) return { error: "Sign in with two-factor first." };
  const rc = newRecoveryCodes();
  sql().prepare("UPDATE admin_users SET recovery_codes = ?, version = version + 1 WHERE id = ?").run(JSON.stringify(rc.hashes), st.admin.id);
  await recordAuthEvent("mfa_enabled", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email, details: { recovery_codes: "regenerated" } });
  return { ok: "New recovery codes. The old ones no longer work.", codes: rc.plain };
}

/** Turn 2FA off for this account (needs a fresh 2FA session, and is refused while the owner requires 2FA). */
export async function disableMfa(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st || st.mfa !== "ok") return { error: "Sign in again first." };
  const sec = sql().prepare("SELECT value FROM settings WHERE key = 'security'").get() as { value: string } | undefined;
  if (sec && JSON.parse(sec.value).require_2fa) return { error: "The owner requires two-factor authentication for everyone, so it can't be turned off." };
  sql().prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = '[]', totp_last_step = 0, version = version + 1 WHERE id = ?").run(st.admin.id);
  await recordAuthEvent("mfa_disabled", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email });
  void fd;
  return { ok: "Two-factor authentication is off." };
}
