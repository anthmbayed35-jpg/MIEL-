import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hardenCookie, IDLE_MS, SEEN_COOKIE } from "./lib/cookies";

/**
 * Front door for /admin: refreshes the session, enforces the 12-hour idle timeout, and answers 401 (APIs and
 * server actions) or redirects to the login page (pages) when nobody is signed in. Pages, actions and routes ALSO
 * check the person and their role on the server, so this is one layer, not the only one.
 */
const SECURITY = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store" };
const PUBLIC_ADMIN = ["/admin/login", "/admin/forgot", "/admin/auth/confirm"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_ADMIN.some((p) => path === p || path.startsWith(p + "/"));
  const wantsJson = path.startsWith("/admin/api") || req.headers.has("next-action") || path.endsWith("/export");

  const supabaseOn = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

  let res = NextResponse.next({ request: req });
  const stamp = (r: NextResponse) => Object.entries(SECURITY).forEach(([k, v]) => r.headers.set(k, v));
  stamp(res);

  const deny = (reason: "login" | "expired") => {
    if (isPublic) return res;
    const r = wantsJson
      ? NextResponse.json({ error: reason === "expired" ? "Session expired" : "Authentication required" }, { status: 401 })
      : NextResponse.redirect(new URL(`/admin/login${reason === "expired" ? "?expired=1" : ""}`, req.url));
    stamp(r);
    res.cookies.getAll().forEach((c) => r.cookies.set(c)); // carry cleared/refreshed auth cookies onto the response
    return r;
  };

  if (!supabaseOn) return deny("login");

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        stamp(res);
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, hardenCookie(options)));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) return deny("login");

  // Idle timeout (12 h without a request)
  const seen = Number(req.cookies.get(SEEN_COOKIE)?.value ?? 0);
  if (seen && Date.now() - seen > IDLE_MS) {
    await supabase.auth.signOut();
    res.cookies.delete(SEEN_COOKIE);
    return deny("expired");
  }
  res.cookies.set(SEEN_COOKIE, String(Date.now()), hardenCookie({ maxAge: 60 * 60 * 24 * 7 }));
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
