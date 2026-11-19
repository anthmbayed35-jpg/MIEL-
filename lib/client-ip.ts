/**
 * The caller's IP, for rate limits and the audit log. The app runs behind exactly ONE trusted proxy (Railway's edge),
 * which APPENDS the real client address to X-Forwarded-For. Anything a client puts in front of it is client-controlled,
 * so the RIGHTMOST entry is the only one that can be trusted (taking the first would let anyone dodge a rate limit by
 * sending a made-up header). With no proxy (local development, tests) the single entry is used as is.
 */
export function ipFromHeaders(h: { get(name: string): string | null }): string {
  const xf = h.get("x-forwarded-for");
  if (xf) {
    const parts = xf.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return (h.get("x-real-ip") ?? "unknown").slice(0, 64);
}
