"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client (ANON key + the admin's session cookie). Used only for Realtime; RLS limits it to admins. */
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
