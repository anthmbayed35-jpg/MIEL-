import "server-only";
import { getAdmin, type Admin } from "./auth";
import { inMaintenance } from "./site-mode";

/**
 * Preview mode: while SITE_MODE=maintenance the public sees the under-development page, but a FULLY signed-in admin
 * (any role, 2FA done) sees the real storefront in their own browser session. The decision is always made on the server
 * from the session cookie (proxy.ts for the page, here for the actions); nothing the browser sends can claim it.
 * Returns the admin, or null (not in maintenance, or not signed in).
 */
export async function previewAdmin(): Promise<Admin | null> {
  if (!inMaintenance()) return null;
  return getAdmin();
}
