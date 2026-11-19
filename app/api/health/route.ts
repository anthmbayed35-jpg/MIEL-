import { dbMode, getDb } from "@/lib/db";

// Railway health check. Always evaluated per request (never cached) and never reveals details or secrets.
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * 200 when the server is up AND the database answers a real query (or no database is configured at all, which only
 * local development allows). 503 when the database is configured but unreachable, so Railway doesn't route traffic
 * to (or keeps restarting) an instance that can't serve orders.
 */
export async function GET() {
  if (dbMode() === "none") return Response.json({ status: "ok", db: "not_configured" }, { headers: HEADERS });
  try {
    const res = await Promise.race([
      getDb().from("settings").select("key").limit(1),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    if (res.error) throw new Error("query failed");
    return Response.json({ status: "ok", db: "ok" }, { headers: HEADERS });
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503, headers: HEADERS });
  }
}
