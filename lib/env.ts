/**
 * Environment rules, shared by next.config.ts (build), instrumentation.ts (boot), getDb() and `npm run check-env`.
 * No secrets are ever returned or logged: only variable NAMES appear in messages.
 *
 * Three environments (set MIEL_ENV in each host environment):
 *   production  -> the production Supabase project. Vercel "Production".
 *   staging     -> a separate Supabase project. Vercel "Preview" deployments and local development.
 *   development -> local machine (staging project or no database).
 * MIEL_PRODUCTION_SUPABASE_URL holds the production project URL in EVERY environment, so any non-production
 * deployment can refuse to talk to it.
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

/** On Vercel, VERCEL_ENV is authoritative (a Preview can never count as production, whatever MIEL_ENV says). */
export const isProductionDeploy = (env: Env = process.env) => (env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.MIEL_ENV === "production");

/** True when this process is a hosted deployment (or MIEL_ENV was set explicitly), where every rule is enforced. */
export const isStrict = (env: Env = process.env) => !!env.VERCEL_ENV || !!env.MIEL_ENV;

export function validateEnv(env: Env = process.env): string[] {
  const errors: string[] = [];
  const present = SUPABASE_VARS.filter((k) => !!env[k]);
  const prodUrl = env.MIEL_PRODUCTION_SUPABASE_URL;

  if (present.length > 0 && present.length < SUPABASE_VARS.length)
    errors.push(`Supabase is only partly configured. Missing: ${SUPABASE_VARS.filter((k) => !env[k]).join(", ")}.`);

  if (isStrict(env)) {
    const prod = isProductionDeploy(env);
    if (!["production", "staging", "development"].includes(env.MIEL_ENV ?? "")) errors.push("MIEL_ENV must be set to production, staging or development.");
    if (prod && env.MIEL_ENV !== "production") errors.push("This is a production deployment, so MIEL_ENV must be production.");
    if (!prod && env.MIEL_ENV === "production") errors.push("MIEL_ENV=production is only allowed on the production deployment (Vercel Production).");
    for (const k of [...SUPABASE_VARS, "NEXT_PUBLIC_SITE_URL", "MIEL_PRODUCTION_SUPABASE_URL"]) if (!env[k]) errors.push(`Missing required environment variable ${k}.`);
    if (prod && env.NEXT_PUBLIC_SITE_URL && !/^https:\/\//.test(env.NEXT_PUBLIC_SITE_URL)) errors.push("NEXT_PUBLIC_SITE_URL must be an https:// URL in production.");
  }

  // Environment separation: only the production deployment may use the production database.
  if (env.NEXT_PUBLIC_SUPABASE_URL && prodUrl) {
    const same = host(env.NEXT_PUBLIC_SUPABASE_URL) === host(prodUrl);
    if (same && !(isProductionDeploy(env) && env.MIEL_ENV === "production"))
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
