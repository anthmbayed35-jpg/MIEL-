/**
 * Is email configured? (No "server-only" import: instrumentation.ts and the health check use it.)
 *   MAIL_PROVIDER=brevo (default)  MAIL_FROM + BREVO_API_KEY
 *   MAIL_PROVIDER=smtp             MAIL_FROM + SMTP_URL
 *   MAIL_PROVIDER=file             tests only (MAIL_OUTBOX), refused when MIEL_ENV=production
 * Email is optional until configured; nothing in the app requires it (see lib/mail.ts).
 */
export const fileOutbox = () => (process.env.MAIL_PROVIDER === "file" && process.env.MIEL_ENV !== "production" ? process.env.MAIL_OUTBOX : undefined);
export const mailProvider = () => (process.env.MAIL_PROVIDER === "smtp" ? "smtp" : "brevo");
export const mailConfigured = () => !!fileOutbox() || (!!process.env.MAIL_FROM && (mailProvider() === "smtp" ? !!process.env.SMTP_URL : !!process.env.BREVO_API_KEY));
export const mailStatus = () => (mailConfigured() ? ("configured" as const) : ("not_configured" as const));

/** One startup warning, no secrets. */
export function warnIfMailMissing() {
  if (!mailConfigured()) console.warn("[miel] Email is not configured (MAIL_FROM + BREVO_API_KEY, or SMTP_URL). Invites and password resets will show a one-time link in the admin instead of sending email.");
}
