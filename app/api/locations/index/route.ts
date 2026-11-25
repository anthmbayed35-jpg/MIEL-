import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { searchIndex, searchIndexVersion } from "@/lib/locations";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The compact search index of every region in Lebanon (names, Arabic names and aliases), downloaded ONCE by the checkout and searched in
 * the browser, so typing never calls the server. It is served from the local database (no external service). The URL carries the index
 * version (?v=...): while the version is current the response is immutable, so the browser caches it for good; any edit in
 * Admin > Settings > Locations changes the version and the next checkout downloads the new one. Compression (gzip) is done by the server.
 */
export async function GET(req: Request) {
  if (!rateLimit(`locindex:${ipFromHeaders(req.headers)}`, 60, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const version = searchIndexVersion();
  const asked = new URL(req.url).searchParams.get("v") ?? "";
  const etag = `"${version}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  const body = JSON.stringify(searchIndex());
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "Cache-Control": asked === version ? "public, max-age=31536000, immutable" : "public, max-age=30, must-revalidate",
    },
  });
}
