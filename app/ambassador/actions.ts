"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { ipFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import {
  changeOwnPassword, consumeToken, endSession, loginAmbassador, requireAmbassador, startSession, AMB_COOKIE,
} from "@/lib/ambassador/auth";
import { saveUpload } from "@/lib/ambassador/files";
import { acceptCurrentTerms, markAllRead, markRulesRead, requestMonthlyKit, requestPayout, submitProof, updateProfile } from "@/lib/ambassador/portal";
import { cookies } from "next/headers";

export type PortalState = { ok?: string; error?: string } | null;
const text = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").slice(0, max);

/** Run a portal action: known errors become messages, redirects pass through. */
async function guard(fn: () => Promise<PortalState> | PortalState): Promise<PortalState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && (("digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) || e.message.startsWith("NEXT_REDIRECT"))) throw e; // (the message form is what the test mock throws)
    return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

export async function loginAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const ip = ipFromHeaders(await headers());
    const r = await loginAmbassador(text(fd, "email", 120), text(fd, "password", 200), ip);
    if (!r.ok) return { error: r.error };
    (await cookies()).set(AMB_COOKIE, r.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: r.maxAgeSec });
    redirect("/ambassador");
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/ambassador/login");
}

export async function setPasswordAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const ip = ipFromHeaders(await headers());
    if (!rateLimit(`amb-setpw:${ip}`, 15, 15 * 60_000)) return { error: "Too many attempts. Wait a few minutes and try again." };
    const password = text(fd, "password", 200);
    if (password !== text(fd, "confirm", 200)) return { error: "The two passwords do not match." };
    const id = await consumeToken(text(fd, "token", 200), password, { acceptTerms: fd.get("terms") === "on" });
    await startSession(id, ip);
    redirect("/ambassador");
  });
}

export async function changePasswordAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    const next = text(fd, "next", 200);
    if (next !== text(fd, "confirm", 200)) return { error: "The two new passwords do not match." };
    const keep = (await cookies()).get(AMB_COOKIE)?.value;
    await changeOwnPassword(me.id, text(fd, "current", 200), next, keep);
    return { ok: "Password changed. Other devices were signed out." };
  });
}

export async function profileAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    if (!rateLimit(`amb-form:${me.id}`, 60, 60_000)) return { error: "Slow down a little." };
    updateProfile(me.id, {
      phone: text(fd, "phone", 30), instagram: text(fd, "instagram", 40), payoutMethod: text(fd, "payout_method", 80),
      payoutDetails: text(fd, "payout_details", 300), leaderboardOptOut: fd.get("optout") === "on",
    });
    revalidatePath("/ambassador", "layout");
    return { ok: "Saved." };
  });
}

export async function acceptTermsAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    if (fd.get("terms") !== "on") return { error: "Tick the box to accept the terms." };
    acceptCurrentTerms(me.id);
    revalidatePath("/ambassador", "layout");
    return { ok: "Terms accepted." };
  });
}

export async function rulesReadAction(): Promise<PortalState> {
  const me = await requireAmbassador();
  markRulesRead(me.id);
  revalidatePath("/ambassador", "layout");
  return { ok: "Thanks. Marked as read." };
}

export async function requestPayoutAction(): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    if (!rateLimit(`amb-form:${me.id}`, 60, 60_000)) return { error: "Slow down a little." };
    const cents = requestPayout(me);
    await audit(null, "ambassador.payout_requested", "affiliate", me.id, { cents });
    revalidatePath("/ambassador", "layout");
    return { ok: `Payout of $${(cents / 100).toFixed(2)} requested. The team will pay it soon.` };
  });
}

export async function submitProofAction(_: PortalState, fd: FormData): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    if (!rateLimit(`amb-proof:${me.id}`, 20, 60 * 60_000)) return { error: "Too many uploads. Try again later." };
    const f = fd.get("screenshot");
    let stored = "";
    if (f instanceof File && f.size > 0) stored = (await saveUpload("proofs", f, { pdf: false, maxBytes: 6 * 1_048_576 })).stored;
    submitProof(me.id, text(fd, "mission_id", 60), text(fd, "proof_url", 300), stored);
    revalidatePath("/ambassador/missions");
    return { ok: "Proof sent. We will review it soon." };
  });
}

export async function monthlyKitAction(): Promise<PortalState> {
  return guard(async () => {
    const me = await requireAmbassador();
    requestMonthlyKit(me);
    revalidatePath("/ambassador/kit");
    return { ok: "Requested. We will tell you when it ships." };
  });
}

export async function markReadAction(): Promise<void> {
  const me = await requireAmbassador();
  markAllRead(me.id);
  revalidatePath("/ambassador", "layout");
}
