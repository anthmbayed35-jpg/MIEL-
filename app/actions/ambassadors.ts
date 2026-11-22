"use server";

import { headers } from "next/headers";
import { createApplication } from "@/lib/affiliates";
import { ipFromHeaders } from "@/lib/client-ip";
import { getEngine } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { inMaintenance, STOREFRONT_CLOSED } from "@/lib/site-mode";

export type ApplyResult = { ok: true } | { ok: false; error: string };

/** Minimum seconds between the form being shown and sent: a bot posting instantly is dropped. */
const MIN_FILL_MS = 3000;

/**
 * Public application form (/ambassadors). Spam protection: a hidden honeypot field, a minimum fill time, a rate limit per
 * connection (3 per hour, 10 per day) and a global ceiling, plus a duplicate check on the handle. Everything is validated again here.
 */
export async function applyAction(_prev: ApplyResult | null, fd: FormData): Promise<ApplyResult> {
  if (inMaintenance()) return STOREFRONT_CLOSED;
  try {
    if (String(fd.get("website") ?? "")) return { ok: true }; // a bot filled the hidden field: pretend it worked, store nothing
    const started = Number(fd.get("started"));
    const age = Date.now() - started;
    // a missing, instant or day-old timestamp is not a person filling in a form
    if (!Number.isFinite(started) || started <= 0 || age < MIN_FILL_MS || age > 86_400_000) return { ok: false, error: "That was quick. Take a second and send it again." };
    const ip = ipFromHeaders(await headers());
    if (!rateLimit(`apply:h:${ip}`, 3, 3_600_000) || !rateLimit(`apply:d:${ip}`, 10, 86_400_000)) return { ok: false, error: "Too many applications from this connection. Try again later." };
    if (!rateLimit("apply:all", 200, 86_400_000)) return { ok: false, error: "We are getting a lot of applications right now. Try again tomorrow." };
    const text = (k: string) => String(fd.get(k) ?? "");
    const ig = text("instagram_handle").trim().replace(/^@+/, "").toLowerCase();
    if (ig) {
      const dup = getEngine().sqlite.prepare("SELECT 1 FROM affiliate_applications WHERE lower(instagram_handle) = ? AND created_at > ?").get(ig, new Date(Date.now() - 30 * 86_400_000).toISOString());
      if (dup) return { ok: false, error: "We already have your application. We will be in touch." };
    }
    createApplication({
      name: text("name"), instagram_handle: text("instagram_handle"), tiktok_handle: text("tiktok_handle"),
      followers: text("followers"), city: text("city"), sport: text("sport"), message: text("message"),
    });
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    // validation messages are written for people; anything else (a database error) is not shown
    return { ok: false, error: /^(Enter|Add|Handles|Followers)/.test(m) ? m : "Something went wrong. Try again." };
  }
}
