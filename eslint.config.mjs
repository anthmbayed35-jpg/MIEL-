import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "backups/**", "playwright-report/**", "test-results/**", "assets-src/**", "public/**", "config/photos.generated.ts"]),
  {
    // The data layer, aggregations, scripts and tests handle rows from an UNTYPED query client (a small SQL builder without generated
    // types). `any` is confined to these files; correctness there is covered by the integration tests.
    files: ["lib/db/**", "lib/stats.ts", "lib/analytics.ts", "lib/orders.ts", "lib/seed.ts", "lib/session.ts", "scripts/**", "tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // "Set state inside an effect" is flagged by a new, opinionated React rule. Our uses are one-time mount reads
    // (localStorage, hydration flags) that are correct and cheap, so the rule is off rather than contorting them.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);
