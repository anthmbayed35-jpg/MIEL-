import { NextResponse, type NextRequest } from "next/server";
import { lookupSession, SESSION_COOKIE } from "./lib/session";
import { inMaintenance, MAINTENANCE_MESSAGE, RETRY_AFTER_SECONDS, staysOpenInMaintenance } from "./lib/site-mode";

/**
 * Front door of the whole app.
 *
 * /admin: answers 401 (APIs and server actions) or redirects to the login page (pages) when nobody is signed in, and ends
 * sessions idle for more than 12 hours. Pages, actions and routes ALSO check the person and their role on the server
 * (lib/auth.ts), so this is one layer, not the only one. The database file is never served: it lives on the volume.
 *
 * Everything else (the public storefront): in SITE_MODE=maintenance every public page answers 503 with the branded
 * "under development" page, and every other public request (cart, checkout and order server actions, /api/track, the
 * sitemap ...) answers a JSON 503. Admin, /api/health, static files and uploads stay open. EXCEPT: a fully signed-in admin
 * (any role) passes through and sees the real storefront in preview mode (lib/preview.ts). The actions and routes refuse
 * by themselves (lib/site-mode.ts, lib/orders.ts), so even an admin cannot create a real order: only a confirmed TEST order.
 */
const SECURITY = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store" };
const PUBLIC_ADMIN = ["/admin/login", "/admin/forgot", "/admin/set-password"];

/** A fully signed-in admin (any role, 2FA done if they have it): the session cookie is looked up in the database. */
function isPreviewAdmin(req: NextRequest): boolean {
  try {
    const f = lookupSession(req.cookies.get(SESSION_COOKIE)?.value);
    const u = f.ok ? f.session.user : null;
    return !!u && !u.mustChangePassword && !u.mustEnrollMfa && (f.ok && (f.session.mfaOk || !u.totpEnabled));
  } catch {
    return false; // an unreadable database never opens the door
  }
}

function publicGate(req: NextRequest, path: string) {
  if (!inMaintenance() || staysOpenInMaintenance(path)) return NextResponse.next();
  if (isPreviewAdmin(req)) {
    // Preview: the real storefront, for this signed-in admin only. Never cached, never indexed.
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  const headers = { "Retry-After": String(RETRY_AFTER_SECONDS), "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store" };
  const isPage = (req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api/") && !req.headers.has("next-action");
  if (isPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.rewrite(url, { status: 503, headers });
  }
  return NextResponse.json({ ok: false, error: `${MAINTENANCE_MESSAGE}. Orders are closed.` }, { status: 503, headers });
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path !== "/admin" && !path.startsWith("/admin/")) {
    const res = publicGate(req, path);
    if (path === "/ambassador" || path.startsWith("/ambassador/") || path.startsWith("/partner/")) Object.entries(SECURITY).forEach(([k, v]) => res.headers.set(k, v)); // the portal is private: never indexed, never cached
    return res;
  }

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

// Everything except the build's own static files: the admin (sign-in gate) and the public site (maintenance gate).
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
