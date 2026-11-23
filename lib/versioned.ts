import "server-only";
import { getEngine } from "./db";

/**
 * Stale-save protection for the key/value records behind the store settings and the page content (tables `settings` and
 * `pages_content`). Every form carries the `version` of the record it was opened on (0 = the record did not exist yet). A save only
 * succeeds if the record is still at that version; otherwise nothing is written and the person is told to reload, instead of one
 * person's edit silently overwriting another's. The check and the write happen in one transaction.
 */
export const STALE_MESSAGE = "This was changed elsewhere since you opened it. Reload the page to see the latest version, then make your change again.";

export type KeyedTable = "settings" | "pages_content";
const TABLES: KeyedTable[] = ["settings", "pages_content"];

/** The version a form was opened on, or undefined when the caller sent none (a direct call, which is not checked). */
export function submittedVersion(fd: FormData | undefined): number | undefined {
  const raw = fd?.get("version");
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : -1; // garbage never matches a real version
}

/** The current version of a record: 0 when it does not exist yet. */
export function currentVersion(table: KeyedTable, key: string): number {
  if (!TABLES.includes(table)) throw new Error("unknown table");
  const r = getEngine().sqlite.prepare(`SELECT version FROM ${table} WHERE key = ?`).get(key) as { version: number } | undefined;
  return r?.version ?? 0;
}

/** Same lookup from rows a page has already loaded. */
export const versionIn = (rows: { key: string; version?: number }[], key: string) => rows.find((r) => r.key === key)?.version ?? 0;

/** Writes the record if (and only if) it is still at the version the form was opened on. Throws STALE_MESSAGE otherwise. Returns the new version. */
export function saveVersioned(table: KeyedTable, key: string, value: unknown, fd?: FormData): number {
  if (!TABLES.includes(table)) throw new Error("unknown table");
  const submitted = submittedVersion(fd);
  const now = new Date().toISOString();
  const json = JSON.stringify(value);
  return getEngine().tx(() => {
    const db = getEngine().sqlite;
    const cur = (db.prepare(`SELECT version FROM ${table} WHERE key = ?`).get(key) as { version: number } | undefined)?.version ?? 0;
    if (submitted !== undefined && submitted !== cur) throw new Error(STALE_MESSAGE);
    if (cur === 0) {
      db.prepare(`INSERT INTO ${table} (key, value, version, updated_at) VALUES (?, ?, 1, ?)`).run(key, json, now);
      return 1;
    }
    const r = db.prepare(`UPDATE ${table} SET value = ?, updated_at = ?, version = version + 1 WHERE key = ? AND version = ?`).run(json, now, key, cur);
    if (!r.changes) throw new Error(STALE_MESSAGE);
    return cur + 1;
  });
}

