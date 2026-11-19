import fs from "node:fs";
import Database from "better-sqlite3";
import { E2E_DB, E2E_OUTBOX } from "./e2e-env";

/** Direct look at the throwaway database the app under test is using (reads are safe alongside the running server: WAL mode). */
export function query<T = Record<string, any>>(sql: string, ...params: unknown[]): T[] {
  const db = new Database(E2E_DB, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}
export const one = <T = Record<string, any>>(sql: string, ...params: unknown[]) => query<T>(sql, ...params)[0];

/** Test setup only (e.g. empty a product's stock). The app reads the database on every request, so it sees this at once. */
export function exec(sql: string, ...params: unknown[]) {
  const db = new Database(E2E_DB, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 5000");
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

export const stockOf = (slug: string) => one<{ on_hand: number }>("SELECT i.on_hand FROM inventory_items i JOIN products p ON p.id = i.product_id WHERE p.slug = ?", slug)!.on_hand;

/** Emails the app "sent" (MAIL_PROVIDER=file). */
export const mails = (): { to: string; subject: string; text: string }[] =>
  fs.existsSync(E2E_OUTBOX) ? fs.readFileSync(E2E_OUTBOX, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
export const linkFor = (to: string) => [...mails()].reverse().find((m) => m.to === to)?.text.match(/https?:\/\/\S+/)?.[0];
