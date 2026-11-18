import type { CookieOptions } from "@supabase/ssr";

/** Every auth cookie is httpOnly (JavaScript can't read it), Secure in production and SameSite=Lax. */
export const hardenCookie = (o?: CookieOptions): CookieOptions => ({
  ...o,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

/** Idle timeout: a session unused for this long is ended (checked in proxy.ts). */
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const SEEN_COOKIE = "miel_seen";

/** Only same-site /admin paths may be used as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.includes("\\") || next.includes("://")) return fallback;
  return next;
}
