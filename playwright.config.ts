import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against a REAL production build served by `next start`.
 * The build is made with sentinel secrets, so the tests can prove the service-role key never reaches a browser
 * file. Supabase points at a closed local port, so no real service is touched.
 */
export const E2E_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sentinel-anon-key-public-by-design",
  SUPABASE_SERVICE_ROLE_KEY: "SENTINEL_SERVICE_ROLE_KEY_must_never_reach_a_browser",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3401",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  // Locally uses the installed Edge; in CI set E2E_BROWSER_CHANNEL= (empty) after `npx playwright install chromium`.
  use: { baseURL: "http://localhost:3401", channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" },
  webServer: {
    command: "npx next build && npx next start -p 3401",
    url: "http://localhost:3401/admin/login",
    timeout: 400_000,
    reuseExistingServer: false,
    env: E2E_ENV as unknown as Record<string, string>,
  },
});
