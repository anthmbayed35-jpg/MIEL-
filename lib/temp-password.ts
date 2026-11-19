import crypto from "node:crypto";
import { passwordProblem } from "./passwords";

/**
 * Temporary passwords for "Add member": 20 random characters from an alphabet without look-alikes (no 0/O, 1/l/I),
 * about 115 bits, shown as four groups of five. Generated with crypto.randomInt; the owner never types or chooses one.
 * It always satisfies the normal password strength rules. Never log or persist the value: only its hash is stored.
 */
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const ALL = LOWER + UPPER + DIGIT;
const pick = (set: string) => set[crypto.randomInt(set.length)];

export function generateTemporaryPassword(): string {
  for (;;) {
    const chars = Array.from({ length: 20 }, () => pick(ALL));
    if (!(/[a-z]/.test(chars.join("")) && /[A-Z]/.test(chars.join("")) && /\d/.test(chars.join("")))) continue;
    const pw = [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
    if (!passwordProblem(pw)) return pw;
  }
}

export const TEMP_PASSWORD_TTL_MS = 48 * 60 * 60 * 1000;
