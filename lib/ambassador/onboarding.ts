import "server-only";
import { approveApplication, getAffiliate, type AffiliateRow } from "../affiliates";
import { getEngine } from "../db";
import { mailConfigured, sendMail } from "../mail";
import { normalizeLebanesePhone, waLink } from "../phone";
import { createToken, setPasswordUrl, INVITE_DAYS } from "./auth";
import { notifyAmbassador } from "./notify";

export type Invite = { affiliate: AffiliateRow; url: string; expiresAt: string; whatsappUrl: string | null; emailed: boolean };

const message = (name: string, url: string) =>
  `Hi ${name.split(" ")[0]}, welcome to the MIEL+ ambassador program! Set your password and open your portal here (the link works once and expires in ${INVITE_DAYS} days): ${url}`;

/** Builds what the team needs to send: the link, a ready WhatsApp message, and (when email is configured) the email, which is skipped silently otherwise. */
export async function inviteFor(affiliateId: string, kind: "invite" | "reset" = "invite"): Promise<Invite> {
  const a = getAffiliate(affiliateId);
  if (!a) throw new Error("That ambassador no longer exists.");
  if (a.status === "ended") throw new Error("This ambassador has ended: reactivate them first.");
  const { token, expiresAt } = createToken(a.id, kind);
  const url = setPasswordUrl(token);
  const phone = a.phone ? normalizeLebanesePhone(a.phone) ?? a.phone.replace(/\D/g, "") : "";
  const text = kind === "invite" ? message(a.name, url) : `Hi ${a.name.split(" ")[0]}, here is your MIEL+ ambassador password reset link (works once, expires in 24 hours): ${url}`;
  const whatsappUrl = phone ? waLink(phone, text) : null;
  let emailed = false;
  if (a.email && mailConfigured()) {
    try {
      const r = await sendMail({ to: a.email, subject: kind === "invite" ? "Welcome to the MIEL+ ambassador program" : "Reset your MIEL+ ambassador password", text });
      emailed = r.sent;
    } catch {
      emailed = false; // a mail problem never blocks the invite: the link is shown in the admin anyway
    }
  }
  return { affiliate: a, url, expiresAt, whatsappUrl, emailed };
}

/** Approve an application: creates the ambassador account (one transaction), then the 7-day invite link. */
export async function approveAndInvite(applicationId: string): Promise<Invite> {
  const aff = approveApplication(applicationId);
  notifyAmbassador(getEngine().sqlite, aff.id, "account", "Welcome to MIEL+", "Your application was approved. Finish your checklist to get started.", "/ambassador");
  return inviteFor(aff.id, "invite");
}
