import { NextResponse } from "next/server";
import { getDb, usesDb } from "@/lib/db";
import { ipFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

// Tiny first-party funnel tracking: visit -> add_to_cart -> begin_checkout. No personal data.
export async function POST(req: Request) {
  try {
    if (!usesDb()) return NextResponse.json({ ok: true });
    const ip = ipFromHeaders(req.headers);
    if (!rateLimit(`track:${ip}`, 60, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });
    const b = await req.json();
    if (!["visit", "add_to_cart", "begin_checkout"].includes(b.type)) return NextResponse.json({ ok: false }, { status: 400 });
    await getDb().from("events").insert({
      type: b.type, session_id: String(b.session ?? "").slice(0, 40), path: String(b.path ?? "").slice(0, 120),
      utm_source: b.utm ? String(b.utm).slice(0, 60) : null, is_demo: false,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
