import { NextResponse, type NextRequest } from "next/server";
import { lookupSession, SESSION_COOKIE } from "./lib/session";

/**
 * Front door for /admin: answers 401 (APIs and server actions) or redirects to the login page (pages) when nobody is
 * signed in, and ends sessions idle for more than 12 hours. Pages, actions and routes ALSO check the person and their
 * role on the server (lib/auth.ts), so this is one layer, not the only one.
 * The database file is never served: it lives on the volume, outside public/.
 */
const SECURITY = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store" };
const PUBLIC_ADMIN = ["/admin/login", "/admin/forgot", "/admin/set-password"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_ADMIN.some((p) => path === p || path.startsWith(p + "/"));
  const wantsJson = path.startsWith("/admin/api") || req.headers.has("next-action") || path.endsWith("/export") || path.startsWith("/admin/backup");

  const res = NextResponse.next({ request: req });
  const stamp = (r: NextResponse) => Object.entries(SECURITY).forEach(([k, v]) => r.headers.set(k, v));
  stamp(res);

  const deny = (reason: "login" | "expired") => {
    if (isPublic) return res;
    const r = wantsJson
      ? NextResponse.json({ error: reason === "expired" ? "Session expired" : "Authentication required" }, { status: 401 })
      : NextResponse.redirect(new URL(`/admin/login${reason === "expired" ? "?expired=1" : ""}`, req.url));
    stamp(r);
    if (reason === "expired") r.cookies.delete(SESSION_COOKIE);
    return r;
  };

  let found;
  try {
    found = lookupSession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    return deny("login"); // an unreadable database never opens the door
  }
  if (!found.ok) return deny(found.reason === "expired" ? "expired" : "login");
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
