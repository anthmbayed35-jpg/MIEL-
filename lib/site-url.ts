/**
 * THE one place an absolute URL of this site comes from: NEXT_PUBLIC_SITE_URL (the final domain, e.g.
 * https://yourdomain.com). Sitemap, robots, Open Graph, JSON-LD and the invite / password-reset links all use this.
 * Nothing derives a URL from the request, the host platform or a hardcoded domain.
 *
 * NEXT_PUBLIC_* values are baked in at BUILD time, so changing the domain means rebuilding (a Railway redeploy does).
 * Hosted environments fail the build/boot when it is missing (lib/env.ts); only local development falls back.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const absoluteUrl = (path: string) => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

/** Link in an invite email. The token is only consumed when the person submits the form (a link scanner can't use it up). */
export const inviteUrl = (token: string) => absoluteUrl(`/admin/set-password?type=invite&token=${encodeURIComponent(token)}`);
/** Link in a password-reset email. */
export const resetUrl = (token: string) => absoluteUrl(`/admin/set-password?type=reset&token=${encodeURIComponent(token)}`);
