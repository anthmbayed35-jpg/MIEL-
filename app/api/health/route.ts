import fs from "node:fs";
import path from "node:path";
import { dataDir, getEngine } from "@/lib/db";
import { lastBackupAgeHours } from "@/lib/backup";

// Railway health check. Always evaluated per request (never cached) and never reveals details or secrets.
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * 200 when the server is up, the database answers a real query AND the volume is writable. 503 with no details
 * otherwise, so Railway doesn't route traffic to (or keeps restarting) an instance that can't take orders safely.
 * Also reports how old the newest backup is (informational: a young deploy has none yet and must still go live).
 */
export async function GET() {
  try {
    const db = getEngine().sqlite;
    const row = db.prepare("SELECT COUNT(*) AS n FROM migrations").get() as { n: number };
    if (!row || row.n < 1) throw new Error("no migrations");
    const probe = path.join(dataDir(), `.health-${process.pid}`);
    fs.writeFileSync(probe, String(Date.now()));
    fs.rmSync(probe, { force: true });
    return Response.json({ status: "ok", db: "ok", volume: "writable", backupAgeHours: lastBackupAgeHours() }, { headers: HEADERS });
  } catch {
    return Response.json({ status: "error" }, { status: 503, headers: HEADERS });
  }
}
