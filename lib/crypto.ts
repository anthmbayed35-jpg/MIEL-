import crypto from "node:crypto";

/**
 * Small crypto helpers (no "server-only" import: proxy.ts uses them too).
 * AUTH_SECRET is the one application secret: it encrypts two-factor secrets and backups at rest and salts the hashes used
 * for rate limiting. It is required in every hosted environment (lib/env.ts); only local development falls back.
 */
export function authSecret(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return crypto.createHash("sha256").update(s).digest();
  if (process.env.MIEL_ENV === "production" || process.env.NODE_ENV === "production") {
    if (process.env.MIEL_ENV) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  }
  return crypto.createHash("sha256").update("miel-dev-only-secret-not-for-production").digest();
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/** HMAC of an identifier (email, IP) keyed with AUTH_SECRET, so logs and rate-limit rows never hold the raw value. */
export const hmac = (value: string) => crypto.createHmac("sha256", authSecret()).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string, key = authSecret()): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}
export function decrypt(blob: string, key = authSecret()): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1") throw new Error("unknown encryption format");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
