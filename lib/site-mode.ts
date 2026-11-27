/**
 * SITE_MODE: "live" (default) or "maintenance". Read at REQUEST time (never baked into the build), so changing the
 * Railway variable and restarting is enough. In maintenance mode the public storefront answers 503 with one branded page,
 * and every order/cart/checkout entry point refuses, server-side (proxy.ts and each action/route).
 * No "server-only" import: proxy.ts uses it too.
 */
export type SiteMode = "live" | "maintenance";

export const siteMode = (env: Record<string, string | undefined> = process.env): SiteMode => (env.SITE_MODE?.trim().toLowerCase() === "maintenance" ? "maintenance" : "live");
export const inMaintenance = () => siteMode() === "maintenance";

/** Seconds browsers and crawlers are told to wait before trying again. */
export const RETRY_AFTER_SECONDS = 3600;
export const MAINTENANCE_MESSAGE = "MIEL+ is under development";

/** Paths that stay reachable in maintenance mode (everything else public gets the 503 page). */
const STATIC_EXT = /\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs|woff2?|ttf|otf|map|json|txt|webmanifest)$/i;
export function staysOpenInMaintenance(path: string): boolean {
  if (path === "/robots.txt") return true; // serves "disallow everything"
  if (path === "/api/health" || path.startsWith("/api/health/")) return true;
  if (path === "/admin" || path.startsWith("/admin/")) return true; // admin, its login, admin APIs, auth pages, exports, backups
  if (path.startsWith("/uploads/") || path.startsWith("/_next/") || path.startsWith("/brand/") || path.startsWith("/images/") || path.startsWith("/media/")) return true;
  return STATIC_EXT.test(path); // icons, fonts, images. NOT sitemap.xml: it is hidden with the rest
}

/** What an admin previewing the hidden storefront must send (a ticked, explicit box) to place a TEST order. */
export const TEST_ORDER_CONFIRMATION = "I confirm this is a test order";

/** The shared answer for refused order/cart/checkout calls. */
export const STOREFRONT_CLOSED = { ok: false as const, error: "MIEL+ isn't taking orders yet. Something new is coming." };
