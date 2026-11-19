import { defineConfig } from "@playwright/test";
import { APP_PORT, BASE_URL, E2E_ENV, MAINT_PORT, MAINT_ENV } from "./tests/support/e2e-env";

/**
 * End-to-end tests run against a REAL production build, started exactly the way Railway starts it (`npm run build`,
 * then `npm start` on $PORT) on a throwaway SQLite database (see tests/support/e2e-start.mjs). No service is mocked:
 * sign-in, sessions, checkout, live alerts (SSE), uploads, backups and the health check are the production code paths.
 * The build uses sentinel secrets, so the tests can prove none of them reaches a browser file.
 */
export { E2E_ENV };

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  // Locally uses the installed Edge; in CI set E2E_BROWSER_CHANNEL= (empty) after `npx playwright install chromium`.
  use: { baseURL: BASE_URL, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" },
  webServer: [
    {
      command: "node tests/support/e2e-start.mjs",
      url: `http://localhost:${APP_PORT}/api/health`,
      timeout: 600_000,
      reuseExistingServer: false,
      env: E2E_ENV as unknown as Record<string, string>,
    },
    {
      // The SAME build, started a second time with SITE_MODE=maintenance and no email configured (proves SITE_MODE is read at
      // runtime, not baked into the build). It shares the database file with the first server.
      command: "node scripts/start.mjs",
      url: `http://localhost:${MAINT_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: MAINT_ENV as unknown as Record<string, string>,
    },
  ],
});
