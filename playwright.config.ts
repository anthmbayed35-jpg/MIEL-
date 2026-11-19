import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against a REAL production build, started exactly the way Railway starts it
 * (`npm run build`, then `npm start` on $PORT). Supabase is replaced by a tests-only mock HTTP server
 * (tests/support/mock-supabase.ts) so login, checkout, alerts, uploads and revalidation can be exercised without
 * a real project. The build uses sentinel secrets, so the tests can prove the service-role key never reaches a
 * browser file.
 */
export const APP_PORT = 3401;
export const MOCK_PORT = 3402;
export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

export const E2E_ENV = {
  MIEL_ENV: "staging",
  MIEL_PRODUCTION_SUPABASE_URL: "https://production-project-placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: MOCK_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sentinel-anon-key-public-by-design",
  SUPABASE_SERVICE_ROLE_KEY: "SENTINEL_SERVICE_ROLE_KEY_must_never_reach_a_browser",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(APP_PORT),
};

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  // Locally uses the installed Edge; in CI set E2E_BROWSER_CHANNEL= (empty) after `npx playwright install chromium`.
  use: { baseURL: `http://localhost:${APP_PORT}`, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" },
  // Started in order: the mock must be up before the build, which pre-renders pages from the database.
  webServer: [
    {
      command: "npx tsx --conditions=react-server tests/support/mock-supabase.ts",
      url: `${MOCK_URL}/__test/ping`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { MOCK_PORT: String(MOCK_PORT) },
    },
    {
      command: `node tests/support/wait-for.mjs ${MOCK_URL}/__test/ping && npm run build && npm start`,
      url: `http://localhost:${APP_PORT}/api/health`,
      timeout: 600_000,
      reuseExistingServer: false,
      env: E2E_ENV as unknown as Record<string, string>,
    },
  ],
});
