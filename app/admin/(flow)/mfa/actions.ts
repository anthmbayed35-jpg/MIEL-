"use server";

import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import { authClient } from "@/lib/supabase-server";
import type { ActionState } from "@/components/admin/ActionForm";

export type EnrollStart = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };

/** Begin TOTP setup: returns the QR code and secret to scan. Any half-finished earlier attempt is discarded. */
export async function startEnroll(): Promise<EnrollStart> {
  const st = await getAdminState();
  if (!st) return { ok: false, error: "Sign in first." };
  const supabase = await authClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `MIEL+ ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ok: false, error: "Couldn't start setup. Is two-factor authentication enabled in your Supabase project?" };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirm the first code from the authenticator app to finish enrolment. */
export async function finishEnroll(factorId: string, code: string): Promise<ActionState> {
  const st = await getAdminState();
  if (!st) return { error: "Sign in first." };
  const ip = await clientIp();
  if (await isThrottled("mfa_failed", ip, st.admin.email)) return { error: "Too many wrong codes. Wait 15 minutes." };
  const supabase = await authClient();
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
  if (e1 || !ch) return { error: "Couldn't verify. Start again." };
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.replace(/\s/g, "") });
  if (error) {
    await recordAuthEvent("mfa_failed", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
    return { error: "That code didn't match. Check the time on your phone and try the next code." };
  }
  await recordAuthEvent("mfa_enabled", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  return { ok: "Two-factor authentication is on." };
}

/** Second step of sign-in for people who have 2FA. */
export async function verifyLogin(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st) redirect("/admin/login");
  const ip = await clientIp();
  if (await isThrottled("mfa_failed", ip, st.admin.email)) return { error: "Too many wrong codes. Wait 15 minutes." };
  const supabase = await authClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  const factor = list?.totp?.[0];
  if (!factor) return { error: "No authenticator found. Ask the owner to reset your two-factor setup." };
  const { data: ch } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  const { error } = ch ? await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: String(fd.get("code") ?? "").replace(/\s/g, "") }) : { error: true };
  if (error) {
    await recordAuthEvent("mfa_failed", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
    return { error: "That code didn't match. Try the next one." };
  }
  await recordAuthEvent("mfa_verified", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  redirect("/admin");
}

/** Turn 2FA off for this account (needs a fresh 2FA session). */
export async function disableMfa(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st || st.mfa !== "ok") return { error: "Sign in again first." };
  const supabase = await authClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.totp ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: "Couldn't turn it off. Sign in again and retry." };
  }
  await recordAuthEvent("mfa_disabled", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email });
  void fd;
  return { ok: "Two-factor authentication is off." };
}
