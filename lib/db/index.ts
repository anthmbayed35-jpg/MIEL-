import "server-only";
import path from "node:path";
import { getEngine, dataDir, type Engine } from "./core";
import type { Result, Row } from "./query";

export type { Row, Engine };
export { dataDir };
export type Db = {
  from(table: string): any;
  rpc(name: string, args?: Row): PromiseLike<Result>;
};
export const uploadsDir = () => path.join(dataDir(), "uploads");

/** The store always has its own database (SQLite on the volume), so the storefront always reads from it. */
export const usesDb = () => true;

/** Query-builder client. Server code only. */
export function getDb(): Db {
  return getEngine() as unknown as Db;
}
export { getEngine };

/** Throw on an error result, otherwise return data. */
export function must<T = any>(res: Result<T>): T {
  if (res.error) throw new Error(friendly(res.error.message));
  return res.data;
}

/** A person never sees driver wording: a missing or stale id reads as "no longer exists". Other messages (unique, version) keep their wording. */
export function friendly(message: string): string {
  if (/multiple \(or no\) rows|no rows|foreign key/i.test(message)) return "That record no longer exists. Reload the page and try again.";
  return message;
}
