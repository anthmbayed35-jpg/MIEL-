import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * The admin QA runs a REAL production build (`npm run build`, then `npm start`, like Railway) on a throwaway SQLite database in a temp
 * folder that mimics the Railway volume: <QA_DIR>/db/miel.db with uploads/ and backups/ next to it. The data is fake (qa-seed.ts),
 * the accounts are the throwaway ones of tests/support/e2e-env.ts, the secret is random per run and never printed, mail goes to a
 * local file, and nothing talks to an outside service.
 */
export const QA_PORT = 3450;
export const QA_URL = `http://localhost:${QA_PORT}`;
export const QA_DIR = process.env.QA_DIR || path.join(os.tmpdir(), "miel-admin-qa");
export const QA_DB = path.join(QA_DIR, "db", "miel.db");
export const QA_OUTBOX = path.join(QA_DIR, "outbox.jsonl");
export const QA_LOG = path.join(QA_DIR, "server.log");
export const QA_SHOTS = path.resolve(__dirname, "../../qa-screenshots");
export const QA_RESULTS = path.resolve(__dirname, "../../qa-results");

export const QA_ENV = {
  MIEL_ENV: "staging",
  DATABASE_PATH: QA_DB,
  AUTH_SECRET: crypto.randomBytes(32).toString("hex"),
  NEXT_PUBLIC_SITE_URL: QA_URL,
  MAIL_PROVIDER: "file",
  MAIL_OUTBOX: QA_OUTBOX,
  BACKUPS_DISABLED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(QA_PORT),
};
