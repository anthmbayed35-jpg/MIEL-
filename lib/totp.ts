import crypto from "node:crypto";
import QRCode from "qrcode";
import { sha256 } from "./crypto";

/** TOTP (RFC 6238: SHA-1, 6 digits, 30 s) plus one-time recovery codes. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(crypto.randomBytes(20));

function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const stepOf = (t = Date.now()) => Math.floor(t / 30_000);

/** Returns the matching time step (so it can be remembered and never accepted twice), or null. Allows +-1 step of clock drift. */
export function verifyTotp(secret: string, code: string, lastStep = 0, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const cur = stepOf(now);
  for (const step of [cur - 1, cur, cur + 1]) {
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c)) && step > lastStep) return step;
  }
  return null;
}
export const totpNow = (secret: string, now = Date.now()) => hotp(secret, stepOf(now)); // tests

export const otpauthUri = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`MIEL+:${email}`)}?secret=${secret}&issuer=${encodeURIComponent("MIEL+")}&algorithm=SHA1&digits=6&period=30`;

export const qrSvgDataUrl = async (uri: string) => `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(uri, { type: "svg", margin: 1, width: 192 })).toString("base64")}`;

/** 10 one-time recovery codes. Show them once; only hashes are stored. */
export function newRecoveryCodes(n = 10): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: n }, () => {
    const h = crypto.randomBytes(5).toString("hex");
    return `${h.slice(0, 5)}-${h.slice(5)}`;
  });
  return { plain, hashes: plain.map((c) => sha256(normalizeRecovery(c))) };
}
export const normalizeRecovery = (c: string) => c.replace(/[\s-]/g, "").toLowerCase();
