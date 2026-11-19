import "server-only";
import fs from "node:fs";
import nodemailer from "nodemailer";
import { getDb } from "./db";
import { fileOutbox, mailConfigured, mailProvider } from "./mail-config";

export { mailConfigured, mailProvider, mailStatus, warnIfMailMissing } from "./mail-config";

/**
 * One small mail adapter for invites, password resets and order alerts.
 *   MAIL_PROVIDER=brevo (default)  needs BREVO_API_KEY and MAIL_FROM
 *   MAIL_PROVIDER=smtp             needs SMTP_URL (smtp://user:pass@host:587) and MAIL_FROM
 *   MAIL_PROVIDER=file             tests only: appends each message to MAIL_OUTBOX (refused when MIEL_ENV=production)
 *
 * Email is OPTIONAL until you configure it. With no configuration sendMail() is a safe no-op: it never throws, it writes
 * "email not sent: not configured" to the audit log (subject only, no address, no body) and returns { sent: false }.
 * Callers that need a person to receive something (invites, resets) then hand the owner a one-time link to pass on
 * manually (lib/invites.ts). A configured provider that fails (rejected key, network) still throws, so that is never silent.
 */
export type Mail = { to: string; subject: string; text: string; html?: string };
export type MailResult = { sent: true } | { sent: false; reason: "not_configured" };

/** "MIEL+ <orders@domain>" or a bare address. */
function sender(): { name?: string; email: string } {
  const raw = process.env.MAIL_FROM ?? "";
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: raw.trim() };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const outbox = fileOutbox();
  if (outbox) {
    fs.appendFileSync(outbox, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
    return { sent: true };
  }
  if (!mailConfigured()) {
    try {
      await getDb().from("audit_log").insert({ actor_email: "system", action: "email_not_sent", entity: "email", entity_id: "not_configured", details: { reason: "not_configured", subject: mail.subject.slice(0, 120) } });
    } catch {
      // never let the audit write break the caller
    }
    return { sent: false, reason: "not_configured" };
  }
  const from = sender();
  if (mailProvider() === "smtp") {
    const t = nodemailer.createTransport(process.env.SMTP_URL!);
    await t.sendMail({ from: from.name ? `"${from.name}" <${from.email}>` : from.email, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return { sent: true };
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: from, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, ...(mail.html ? { htmlContent: mail.html } : {}) }),
  });
  if (!res.ok) throw new Error(`Email provider refused the message (HTTP ${res.status}).`);
  return { sent: true };
}
