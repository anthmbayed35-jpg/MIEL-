/** `npm run check-env`: validates the environment WITHOUT printing any values. Run before deploying. */
import { validateEnv } from "../lib/env";

const errors = validateEnv();
if (errors.length) {
  console.error("Environment check FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
const names = ["MIEL_ENV", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SITE_URL", "MIEL_PRODUCTION_SUPABASE_URL"];
console.log("Environment check passed.");
for (const n of names) console.log(`  ${process.env[n] ? "set    " : "missing"}  ${n}`);
