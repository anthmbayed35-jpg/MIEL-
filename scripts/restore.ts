/**
 * `npm run restore -- <backup file> --yes`
 *
 * Replaces the live database with a backup (a .db snapshot from /data/backups, a .db.enc off-site copy, or the .zip from
 * Settings > Download backup, which also restores the uploaded images). The current database is saved first as
 * backups/pre-restore-<time>.db, and the backup is integrity-checked BEFORE anything is touched.
 *
 * STOP THE APP FIRST (Railway: scale to zero / stop the deployment), run this from the Railway shell with DATABASE_PATH
 * set to the volume, then start it again. For .enc files BACKUP_ENCRYPTION_KEY must be set.
 */
import { restoreFrom } from "../lib/backup";

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("Usage: npm run restore -- <backup file> --yes");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("This REPLACES the current database with the backup. Stop the app first, then re-run with --yes.");
  process.exit(1);
}
try {
  const r = restoreFrom(file);
  console.log(`Restored (${r.restoredTables} tables).${r.savedPrevious ? ` The previous database was saved as ${r.savedPrevious}.` : ""} Start the app again.`);
} catch (e) {
  console.error(`Restore failed, nothing was changed: ${String((e as Error).message)}`);
  process.exit(1);
}
