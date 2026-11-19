/** `npm run check-env`: validates the environment WITHOUT printing any values. Run before deploying. */
import { validateEnv } from "../lib/env";

const errors = validateEnv();
if (errors.length) {
  console.error("Environment check FAILED:\n - " + errors.join("\n - "));
  process.exit(1);
}
const names = ["MIEL_ENV", "DATABASE_PATH", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "MAIL_FROM", "BREVO_API_KEY", "SMTP_URL"];
console.log("Environment check passed.");
for (const n of names) console.log(`  ${process.env[n] ? "set    " : "missing"}  ${n}`);
