"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { hardenCookie } from "@/lib/cookies";
import { consumeToken, InviteError } from "@/lib/invites";
import { passwordProblem } from "@/lib/passwords";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import { getEngine } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

/**
 * Choose a password from an invite or reset link. This is where the single-use token is consumed (a button click on
 * this form, never on page load, so email link scanners can't use it up). Then the person is signed in.
 */
export async function setPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  const kind = String(fd.get("type")) === "invite" ? "invite" : "reset";
  const token = String(fd.get("token") ?? "");
  if (await isThrottled("login_failed", ip)) return { error: "Too many attempts. Wait 15 minutes and try again." };
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  let userId: string;
  try {
    userId = await consumeToken(kind, token, password);
  } catch (e) {
    await recordAuthEvent("login_failed", { ip, details: { reason: "bad_link", type: kind } });
    return { error: e instanceof InviteError ? e.message : "Couldn't save that password. Try again." };
  }
  const u = getEngine().sqlite.prepare("SELECT email FROM admin_users WHERE id = ?").get(userId) as { email: string };
  await recordAuthEvent(kind === "invite" ? "invite_accepted" : "reset_link_used", { ip, actorId: userId, actorEmail: u.email });
  await recordAuthEvent("password_set", { ip, actorId: userId, actorEmail: u.email });
  const { token: session, maxAgeSec } = createSession(userId, { ip, userAgent: (await headers()).get("user-agent") ?? "" });
  (await cookies()).set(SESSION_COOKIE, session, hardenCookie({ maxAge: maxAgeSec }));
  redirect("/admin");
}
