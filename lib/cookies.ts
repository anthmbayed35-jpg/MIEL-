/** Every auth cookie is httpOnly (JavaScript can't read it), Secure in production and SameSite=Lax. */
export type CookieOptions = { maxAge?: number; expires?: Date; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none"; path?: string };

export const hardenCookie = (o?: CookieOptions): CookieOptions => ({
  ...o,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

/** Only same-site /admin paths may be used as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.includes("\\") || next.includes("://")) return fallback;
  return next;
}
