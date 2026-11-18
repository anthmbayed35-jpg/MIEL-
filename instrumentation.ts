// Runs once when the server boots (Node runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Store timezone: dates, "today" and day buckets are computed in Beirut time, not the server's UTC.
  process.env.TZ = process.env.STORE_TIMEZONE || "Asia/Beirut";

  // Refuse to boot a hosted environment that is misconfigured (missing variables, wrong Supabase project).
  const { assertEnv, isStrict } = await import("./lib/env");
  if (isStrict() && process.env.SKIP_ENV_CHECK !== "1") assertEnv();
}
