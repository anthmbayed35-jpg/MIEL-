import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeEngine, getEngine } from "../../lib/db/core";
import { createSession, SESSION_COOKIE } from "../../lib/session";

/**
 * Test harness around the REAL stack: every test run gets a fresh temporary SQLite file (migrations applied), and
 * `h.user = {...}` signs that person in with a REAL database session, which the mocked `next/headers` cookie jar presents
 * to the app exactly like a browser would. Nothing about auth or the database is mocked.
 */
export const jar = new Map<string, string>();
export const reqHeaders: Record<string, string> = { "x-forwarded-for": "9.9.9.9" };

export const ID = {
  owner: "00000000-0000-0000-0000-0000000000a1",
  manager: "00000000-0000-0000-0000-0000000000a2",
  staff: "00000000-0000-0000-0000-0000000000a3",
  stranger: "00000000-0000-0000-0000-0000000000ff",
};

/** Test-only password (the accounts live in a throwaway database that is deleted after the run). */
export const TEST_PASSWORD = "test-only-passphrase-2025";

let dir = "";
export const testDir = () => dir;
export const outboxFile = () => path.join(dir, "outbox.jsonl");
export const outbox = (): { to: string; subject: string; text: string }[] =>
  fs.existsSync(outboxFile()) ? fs.readFileSync(outboxFile(), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
/** The link inside the newest email to `to`. */
export const lastLink = (to: string) => {
  const m = [...outbox()].reverse().find((x) => x.to === to);
  return m?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
};

let token: string | undefined;

export const h = {
  /** Sign in as this person (a real session row + cookie). A person that is not on the team gets a cookie that matches no session. */
  set user(u: { id: string; email: string } | null) {
    token = undefined;
    jar.delete(SESSION_COOKIE);
    if (!u) return;
    const exists = getEngine().sqlite.prepare("SELECT 1 FROM admin_users WHERE id = ?").get(u.id);
    token = exists ? createSession(u.id, { ip: "9.9.9.9" }).token : "x".repeat(43);
    jar.set(SESSION_COOKIE, token);
  },
  get user() {
    return token ? { id: "", email: "" } : null;
  },
  /** Emulates the old two-factor levels: nextLevel aal2 = 2FA enrolled; currentLevel aal2 = verified in this session. */
  set aal(v: { currentLevel: string; nextLevel: string }) {
    if (!token) return;
    const db = getEngine().sqlite;
    const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sha(token)) as { user_id: string } | undefined;
    if (!row) return;
    db.prepare("UPDATE admin_users SET totp_enabled = ? WHERE id = ?").run(v.nextLevel === "aal2" ? 1 : 0, row.user_id);
    db.prepare("UPDATE sessions SET mfa_ok = ? WHERE id = ?").run(v.currentLevel === "aal2" ? 1 : 0, sha(token));
  },
  get token() {
    return token;
  },
};

import crypto from "node:crypto";
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Fresh empty database + clean cookie jar. Call in beforeEach. */
export function resetState() {
  closeEngine();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "miel-test-"));
  process.env.DATABASE_PATH = path.join(dir, "miel.db");
  process.env.AUTH_SECRET = "test-only-auth-secret-at-least-32-characters-long";
  process.env.MAIL_PROVIDER = "file";
  process.env.MAIL_OUTBOX = outboxFile();
  process.env.NEXT_PUBLIC_SITE_URL = "https://miel.example";
  delete process.env.MIEL_ENV;
  jar.clear();
  token = undefined;
  getEngine(); // open + migrate
}

export function cleanupState() {
  closeEngine();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = "";
}
