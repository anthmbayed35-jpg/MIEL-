import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createLocalClient } from "./local";

export type Row = Record<string, any>;
type Result<T = any> = { data: T; error: { message: string; code?: string } | null; count?: number | null };
// Loose structural type: both the Supabase client and the local store satisfy this.
export type Db = {
  from(table: string): any;
  rpc(name: string, args?: Row): PromiseLike<Result>;
};

/**
 * supabase: production database.
 * local:    JSON-file store for local development only.
 * demo:     opt-in PREVIEW on Vercel (ADMIN_DEMO=1) when Supabase is NOT configured: the admin opens as owner on
 *           sample data in /tmp (ephemeral). The storefront ignores it and keeps using the config files.
 * none:     nothing configured.
 */
export type DbMode = "supabase" | "local" | "demo" | "none";

export const hasSupabase = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** The JSON-file store is for local dev/demo only. Never on Vercel. */
const localAllowed = () => !process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.MIEL_LOCAL_DB === "1");

export const dbMode = (): DbMode =>
  hasSupabase() ? "supabase" : localAllowed() ? "local" : process.env.ADMIN_DEMO === "1" ? "demo" : "none";

/** Real storefront data (orders, stock, prices from the DB). False in demo/none: the store runs from config + WhatsApp. */
export const usesDb = () => dbMode() === "supabase" || dbMode() === "local";

let supa: Db | null = null;

/** Server-side database client (service role). Throws in "none" mode: callers should check dbMode() first. */
export function getDb(): Db {
  const mode = dbMode();
  if (mode === "supabase") {
    supa ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as Db;
    return supa;
  }
  if (mode === "local" || mode === "demo") return createLocalClient() as unknown as Db;
  throw new Error("Database not configured. Set the Supabase env vars (see .env.example).");
}

/** Throw on a Supabase-style error result, otherwise return data. */
export function must<T = any>(res: Result<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
