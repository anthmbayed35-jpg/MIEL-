import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { getEngine } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { REF_DAYS } from "@/lib/ref";
import { localStamp } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Counts one visit through an ambassador's personal link (/?ref=CODE): a number per ambassador per day (Beirut), nothing else.
 * No IP, no cookie id, no user agent is stored. The browser calls it once per day per code. An unknown or inactive code is
 * ignored without saying so, and the answer is always the same, so the endpoint cannot be used to find out which codes exist.
 */
export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  if (!rateLimit(`ref:${ip}`, 60, 60_000)) return NextResponse.json({ ok: true });
  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (/^[A-Z0-9]{3,20}$/.test(code)) {
    const db = getEngine().sqlite;
    const a = db.prepare("SELECT id FROM affiliates WHERE code = ? AND status = 'active'").get(code) as { id: string } | undefined;
    if (a) {
      const day = localStamp(new Date().toISOString()).slice(0, 10);
      db.prepare("INSERT INTO ref_clicks (affiliate_id, day, count) VALUES (?, ?, 1) ON CONFLICT(affiliate_id, day) DO UPDATE SET count = count + 1").run(a.id, day);
    }
  }
  const res = NextResponse.json({ ok: true });
  if (/^[A-Z0-9]{3,20}$/.test(code)) res.cookies.set("miel_ref", code, { maxAge: REF_DAYS * 86_400, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  return res;
}
