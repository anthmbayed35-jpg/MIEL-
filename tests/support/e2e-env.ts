import path from "node:path";

/**
 * Shared by playwright.config.ts, the seed script and the specs. The app under test is the REAL production build
 * started with `npm start` (as Railway does), on a throwaway SQLite file. Secrets are sentinels, so the specs can prove
 * none of them reaches a browser file.
 */
export const ROOT = path.resolve(__dirname, "../..");
export const APP_PORT = 3401;
export const BASE_URL = `http://localhost:${APP_PORT}`;
export const E2E_DIR = path.join(ROOT, ".data-e2e");
export const E2E_DB = path.join(E2E_DIR, "miel.db");
export const E2E_OUTBOX = path.join(E2E_DIR, "outbox.jsonl");

/** Throwaway accounts that exist only in the throwaway database. */
export const E2E_PASSWORD = "e2e-only-passphrase-2025";
export const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@e2e.test", name: "E2E Owner", role: "owner" },
  manager: { id: "00000000-0000-4000-8000-0000000000a2", email: "manager@e2e.test", name: "E2E Manager", role: "manager" },
  staff: { id: "00000000-0000-4000-8000-0000000000a3", email: "staff@e2e.test", name: "E2E Staff", role: "staff" },
} as const;

export const SENTINEL_AUTH_SECRET = "SENTINEL_AUTH_SECRET_must_never_reach_a_browser_0123456789";
export const SENTINEL_BREVO_KEY = "SENTINEL_BREVO_API_KEY_must_never_reach_a_browser";

export const E2E_ENV = {
  MIEL_ENV: "staging",
  DATABASE_PATH: E2E_DB,
  AUTH_SECRET: SENTINEL_AUTH_SECRET,
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  MAIL_PROVIDER: "file",
  MAIL_OUTBOX: E2E_OUTBOX,
  BREVO_API_KEY: SENTINEL_BREVO_KEY,
  MAIL_FROM: "MIEL+ <orders@e2e.test>",
  GOOGLE_MAPS_API_KEY: "e2e-fake-maps-key", // the Google script itself is stubbed in the tests: no request ever leaves the machine
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(APP_PORT),
};

/** Second server on the same build: maintenance mode, and NO email configured. */
export const MAINT_PORT = 3403;
export const MAINT_URL = `http://localhost:${MAINT_PORT}`;
export const MAINT_ENV = {
  MIEL_ENV: "staging",
  DATABASE_PATH: E2E_DB,
  AUTH_SECRET: SENTINEL_AUTH_SECRET,
  NEXT_PUBLIC_SITE_URL: MAINT_URL,
  SITE_MODE: "maintenance",
  BACKUPS_DISABLED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(MAINT_PORT),
};

/** Third server on the same build: COPY_CLAIMS=off (the facts-only storefront wording). Shares the database file. */
export const COPY_OFF_PORT = 3404;
export const COPY_OFF_URL = `http://localhost:${COPY_OFF_PORT}`;
export const COPY_OFF_ENV = {
  MIEL_ENV: "staging",
  DATABASE_PATH: E2E_DB,
  AUTH_SECRET: SENTINEL_AUTH_SECRET,
  NEXT_PUBLIC_SITE_URL: COPY_OFF_URL,
  COPY_CLAIMS: "off",
  MAIL_PROVIDER: "file",
  MAIL_OUTBOX: E2E_OUTBOX,
  BACKUPS_DISABLED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(COPY_OFF_PORT),
};
