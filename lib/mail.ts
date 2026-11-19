import "server-only";
import fs from "node:fs";
import nodemailer from "nodemailer";

/**
 * One small mail adapter for invites, password resets and order confirmations.
 *   MAIL_PROVIDER=brevo (default)  needs BREVO_API_KEY and MAIL_FROM
 *   MAIL_PROVIDER=smtp             needs SMTP_URL (smtp://user:pass@host:587) and MAIL_FROM
 *   MAIL_PROVIDER=file             tests only: appends each message to MAIL_OUTBOX (refused when MIEL_ENV=production)
 * Missing configuration is an error, never a silent skip: sendMail() throws MailNotConfigured in production, so an
 * invite that cannot be delivered says so. In development it logs the message to the server console instead.
 */
export class MailNotConfigured extends Error {
  constructor(m = "Email isn't set up on this server (MAIL_FROM and BREVO_API_KEY or SMTP_URL).") {
    super(m);
  }
}

export type Mail = { to: string; subject: string; text: string; html?: string };

const fileOutbox = () => (process.env.MAIL_PROVIDER === "file" && process.env.MIEL_ENV !== "production" ? process.env.MAIL_OUTBOX : undefined);
export const mailProvider = () => (process.env.MAIL_PROVIDER === "smtp" ? "smtp" : "brevo");
export const mailRequired = () => process.env.NODE_ENV === "production" || process.env.MIEL_ENV === "production";
export const mailConfigured = () => !!fileOutbox() || (!!process.env.MAIL_FROM && (mailProvider() === "smtp" ? !!process.env.SMTP_URL : !!process.env.BREVO_API_KEY));

/** "MIEL+ <orders@domain>" or a bare address. */
function sender(): { name?: string; email: string } {
  const raw = process.env.MAIL_FROM ?? "";
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: raw.trim() };
}

export async function sendMail(mail: Mail): Promise<void> {
  const outbox = fileOutbox();
  if (outbox) {
    fs.appendFileSync(outbox, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
    return;
  }
  if (!mailConfigured()) {
    if (mailRequired()) throw new MailNotConfigured();
    console.log(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const from = sender();
  if (mailProvider() === "smtp") {
    const t = nodemailer.createTransport(process.env.SMTP_URL!);
    await t.sendMail({ from: from.name ? `"${from.name}" <${from.email}>` : from.email, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: from, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, ...(mail.html ? { htmlContent: mail.html } : {}) }),
  });
  if (!res.ok) throw new Error(`Email provider refused the message (HTTP ${res.status}).`);
}
