import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { regionsOf } from "@/lib/locations";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The visible regions (cities, towns, villages, neighbourhoods) of ONE district, for the checkout selector: /api/locations/regions?district=LB11.
 * Read from the local database (official data); no external service is ever called. Only that district's regions are ever returned.
 */
export async function GET(req: Request) {
  if (!rateLimit(`regions:${ipFromHeaders(req.headers)}`, 120, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const district = new URL(req.url).searchParams.get("district") ?? "";
  const regions = regionsOf(district);
  return NextResponse.json({ regions }, { headers: { "Cache-Control": "private, max-age=60" } });
}
