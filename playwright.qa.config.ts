import { defineConfig } from "@playwright/test";
import { QA_ENV, QA_PORT, QA_URL } from "./tests/qa/qa-env";

/** Admin QA: a production build on a large fake database in a temp folder (see tests/qa/qa-env.ts). Run: npm run qa:admin */
export default defineConfig({
  testDir: "tests/qa",
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 180_000,
  use: { baseURL: QA_URL, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" },
  webServer: {
    command: "node tests/qa/qa-start.mjs",
    url: `http://localhost:${QA_PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: QA_ENV as unknown as Record<string, string>,
  },
});
