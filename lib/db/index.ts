import "server-only";
import { createClient } from "@supabase/supabase-js";
import { validateEnv } from "../env";

export type Row = Record<string, any>;
type Result<T = any> = { data: T; error: { message: string; code?: string } | null; count?: number | null };
export type Db = {
  from(table: string): any;
  rpc(name: string, args?: Row): PromiseLike<Result>;
};

export type DbMode = "supabase" | "none";

export const hasSupabase = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** "supabase" when the project is configured, otherwise "none": the storefront then runs from config and /admin stays closed. */
export const dbMode = (): DbMode => (hasSupabase() ? "supabase" : "none");

/** Real storefront data (orders, stock, prices from the DB). False when no database is configured. */
export const usesDb = () => dbMode() === "supabase";

let supa: Db | null = null;

/** Server-side database client (service role). Refuses to run against the wrong project for this environment. */
export function getDb(): Db {
  if (!hasSupabase()) throw new Error("Database not configured. Set the Supabase environment variables (see docs/OPERATIONS.md).");
  const problems = validateEnv().filter((p) => /PRODUCTION Supabase|production deployment/.test(p));
  if (problems.length) throw new Error(problems[0]);
  supa ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Db;
  return supa;
}

/** Throw on a Supabase-style error result, otherwise return data. */
export function must<T = any>(res: Result<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
