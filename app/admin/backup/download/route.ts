import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { audit } from "@/lib/audit";
import { getAdmin } from "@/lib/auth";
import { getEngine, uploadsDir } from "@/lib/db";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Owner-only "Download backup": a zip with a consistent snapshot of the database (online backup API) and every uploaded
 * image. Recorded in the audit log. Never cached.
 */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!can(admin.role, "backup.download")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const tmp = path.join(os.tmpdir(), `miel-snapshot-${process.pid}-${Date.now()}.db`);
  await getEngine().sqlite.backup(tmp);
  await audit(admin, "backup_download", "backup", "zip");

  const zip = new ZipArchive({ zlib: { level: 6 } });
  const out = new PassThrough();
  zip.pipe(out);
  zip.on("error", () => out.destroy());
  out.on("close", () => fs.rmSync(tmp, { force: true }));
  zip.file(tmp, { name: "miel.db" });
  if (fs.existsSync(uploadsDir())) zip.directory(uploadsDir(), "uploads");
  zip.append("MIEL+ backup. To restore: stop the app, then run  npm run restore -- <this zip>  (see docs/OPERATIONS.md).\n", { name: "README.txt" });
  void zip.finalize();

  const name = `miel-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
