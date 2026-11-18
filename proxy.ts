import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Front door for /admin: refreshes the Supabase session cookie, sends visitors to the login page, adds noindex.
// Pages and server actions ALSO re-check auth and roles on the server; this is not the only protection.
const SECURITY = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "private, no-store" };

export async function proxy(req: NextRequest) {
  const isLogin = req.nextUrl.pathname === "/admin/login";
  const supabaseOn = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const localOn = !process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.MIEL_LOCAL_DB === "1");

  let res = NextResponse.next({ request: req });
  Object.entries(SECURITY).forEach(([k, v]) => res.headers.set(k, v));

  let authed = false;
  if (supabaseOn) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          Object.entries(SECURITY).forEach(([k, v]) => res.headers.set(k, v));
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    authed = !!data.user;
  } else if (localOn) {
    authed = !!req.cookies.get("miel_local_admin")?.value;
  }

  if (!authed && !isLogin) {
    const r = NextResponse.redirect(new URL("/admin/login", req.url));
    r.headers.set("X-Robots-Tag", "noindex, nofollow");
    return r;
  }
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
