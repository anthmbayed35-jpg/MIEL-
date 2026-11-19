/**
 * Environment rules, shared by next.config.ts (build), instrumentation.ts (boot) and `npm run check-env`.
 * No secrets are ever returned or logged: only variable NAMES appear in messages.
 *
 * MIEL_ENV (set it everywhere): production | staging | development.
 * Railway sets RAILWAY_ENVIRONMENT_NAME itself; it is cross-checked against MIEL_ENV so a staging environment can never
 * claim to be production (and the environment named "production" must say so).
 * Environments are separated physically: each Railway environment has its own volume, hence its own database file.
 */
type Env = Record<string, string | undefined>;

/** The Railway environment this process runs in (undefined on a laptop). */
export const railwayEnvironment = (env: Env = process.env) => env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_ENVIRONMENT || undefined;

export const isProductionDeploy = (env: Env = process.env) => env.MIEL_ENV === "production";

/** True on a Railway deployment, or when MIEL_ENV was set explicitly: every rule is enforced. */
export const isStrict = (env: Env = process.env) => !!railwayEnvironment(env) || !!env.MIEL_ENV;

export function validateEnv(env: Env = process.env): string[] {
  const errors: string[] = [];
  if (env.SITE_MODE && !["live", "maintenance"].includes(env.SITE_MODE.trim().toLowerCase())) errors.push('SITE_MODE must be "live" or "maintenance" (unset means live).');
  if (!isStrict(env)) return errors; // plain local development
  const prod = isProductionDeploy(env);

  if (!["production", "staging", "development"].includes(env.MIEL_ENV ?? "")) errors.push("MIEL_ENV must be set to production, staging or development.");
  for (const k of ["NEXT_PUBLIC_SITE_URL", "DATABASE_PATH", "AUTH_SECRET"]) if (!env[k]) errors.push(`Missing required environment variable ${k}.`);
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET must be at least 32 characters.");
  if (env.DATABASE_PATH && env.DATABASE_PATH !== ":memory:" && !/^([a-zA-Z]:)?[\\/]/.test(env.DATABASE_PATH)) errors.push("DATABASE_PATH must be an absolute path (production: /data/miel.db on the Railway volume).");
  if (env.DATABASE_PATH && /[\\/]public[\\/]/.test(env.DATABASE_PATH)) errors.push("DATABASE_PATH must never be inside a public folder.");

  if (prod) {
    if (env.NEXT_PUBLIC_SITE_URL && !/^https:\/\//.test(env.NEXT_PUBLIC_SITE_URL)) errors.push("NEXT_PUBLIC_SITE_URL must be an https:// URL in production.");
    if (env.MAIL_PROVIDER === "file") errors.push("MAIL_PROVIDER=file is for tests and is not allowed in production.");
    // Email is OPTIONAL until configured (lib/mail.ts is a safe no-op, the admin shows a banner), so it is not checked here.
    if (env.BACKUP_S3_BUCKET) {
      for (const k of ["BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_KEY"]) if (!env[k]) errors.push(`Off-site backups are on (BACKUP_S3_BUCKET) but ${k} is missing.`);
    }
  }

  const rw = railwayEnvironment(env);
  if (rw) {
    if (prod && rw !== "production") errors.push(`MIEL_ENV=production is only allowed in the Railway environment named "production" (this one is "${rw}").`);
    if (!prod && rw === "production") errors.push('This is the Railway environment named "production", so MIEL_ENV must be production.');
  }
  return errors;
}

/** Throw with a clear, secret-free message. */
export function assertEnv(env: Env = process.env) {
  const errors = validateEnv(env);
  if (errors.length) throw new Error(`MIEL+ environment check failed:\n - ${errors.join("\n - ")}\nSee docs/OPERATIONS.md.`);
}
