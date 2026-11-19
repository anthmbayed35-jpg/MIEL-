/**
 * Environment rules, shared by next.config.ts (build), instrumentation.ts (boot), getDb() and `npm run check-env`.
 * No secrets are ever returned or logged: only variable NAMES appear in messages.
 *
 * Three environments (set MIEL_ENV in each):
 *   production  -> the production Supabase project. The Railway environment named "production".
 *   staging     -> a separate Supabase project. Any other Railway environment, and local development.
 *   development -> local machine (staging project or no database).
 * MIEL_PRODUCTION_SUPABASE_URL holds the production project URL in EVERY environment, so any non-production
 * deployment can refuse to talk to it.
 *
 * Railway sets RAILWAY_ENVIRONMENT_NAME automatically. It is cross-checked against MIEL_ENV so a staging
 * environment can never claim to be production (and vice versa).
 */
type Env = Record<string, string | undefined>;

const SUPABASE_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

const host = (u?: string) => {
  try {
    return new URL(u ?? "").host.toLowerCase();
  } catch {
    return "";
  }
};

/** The Railway environment this process runs in (undefined on a laptop). */
export const railwayEnvironment = (env: Env = process.env) => env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_ENVIRONMENT || undefined;

/** The production deployment: MIEL_ENV=production (verified against the Railway environment name below). */
export const isProductionDeploy = (env: Env = process.env) => env.MIEL_ENV === "production";

/** True on a Railway deployment, or when MIEL_ENV was set explicitly: every rule is enforced. */
export const isStrict = (env: Env = process.env) => !!railwayEnvironment(env) || !!env.MIEL_ENV;

export function validateEnv(env: Env = process.env): string[] {
  const errors: string[] = [];
  const present = SUPABASE_VARS.filter((k) => !!env[k]);
  const prodUrl = env.MIEL_PRODUCTION_SUPABASE_URL;

  if (present.length > 0 && present.length < SUPABASE_VARS.length)
    errors.push(`Supabase is only partly configured. Missing: ${SUPABASE_VARS.filter((k) => !env[k]).join(", ")}.`);

  if (isStrict(env)) {
    const prod = isProductionDeploy(env);
    if (!["production", "staging", "development"].includes(env.MIEL_ENV ?? "")) errors.push("MIEL_ENV must be set to production, staging or development.");
    for (const k of [...SUPABASE_VARS, "NEXT_PUBLIC_SITE_URL", "MIEL_PRODUCTION_SUPABASE_URL"]) if (!env[k]) errors.push(`Missing required environment variable ${k}.`);
    if (prod && env.NEXT_PUBLIC_SITE_URL && !/^https:\/\//.test(env.NEXT_PUBLIC_SITE_URL)) errors.push("NEXT_PUBLIC_SITE_URL must be an https:// URL in production.");

    // Railway environment name must agree with MIEL_ENV (only the environment NAMED production may be production).
    const rw = railwayEnvironment(env);
    if (rw) {
      if (prod && rw !== "production") errors.push(`MIEL_ENV=production is only allowed in the Railway environment named "production" (this one is "${rw}").`);
      if (!prod && rw === "production") errors.push('This is the Railway environment named "production", so MIEL_ENV must be production.');
    }
  }

  // Environment separation: only the production deployment may use the production database.
  if (env.NEXT_PUBLIC_SUPABASE_URL && prodUrl) {
    const same = host(env.NEXT_PUBLIC_SUPABASE_URL) === host(prodUrl);
    if (same && !isProductionDeploy(env))
      errors.push("This environment points at the PRODUCTION Supabase project but is not the production deployment. Use the staging project (NEXT_PUBLIC_SUPABASE_URL) here.");
    if (!same && isProductionDeploy(env))
      errors.push("The production deployment must use the production Supabase project (NEXT_PUBLIC_SUPABASE_URL must equal MIEL_PRODUCTION_SUPABASE_URL).");
  }
  return errors;
}

/** Throw with a clear, secret-free message. */
export function assertEnv(env: Env = process.env) {
  const errors = validateEnv(env);
  if (errors.length) throw new Error(`MIEL+ environment check failed:\n - ${errors.join("\n - ")}\nSee docs/OPERATIONS.md.`);
}
