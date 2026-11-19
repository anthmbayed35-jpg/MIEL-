// Runs once when the server boots (Node runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Store timezone: dates, "today" and day buckets are computed in Beirut time, not the server's UTC.
  process.env.TZ = process.env.STORE_TIMEZONE || "Asia/Beirut";

  // Refuse to boot a hosted environment that is misconfigured (missing variables).
  const { assertEnv, isStrict } = await import("./lib/env");
  if (isStrict() && process.env.SKIP_ENV_CHECK !== "1") assertEnv();

  // Open the database. This applies pending SQL migrations in transactions and THROWS if one fails, so the server
  // refuses to start instead of running on a half-migrated database.
  const { getEngine } = await import("./lib/db/core");
  const engine = getEngine();

  // First boot of an empty store: load the products, zones and content from config/*. Idempotent (never overwrites).
  const { seedBase } = await import("./lib/seed");
  const products = (engine.sqlite.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number }).n;
  if (products === 0) await seedBase();

  // Nightly backups of the database file (single instance: one scheduler).
  const { startBackupScheduler } = await import("./lib/backup");
  startBackupScheduler();
}
