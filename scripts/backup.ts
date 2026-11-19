/**
 * `npm run backup`: take a consistent snapshot now (same as the nightly one). Run it on the server so DATABASE_PATH
 * points at the real volume. Prints the file name only.
 */
import { runBackup } from "../lib/backup";

runBackup()
  .then((r) => console.log(`Backup saved: ${r.file}${r.offsite ? " (and copied off-site)" : ""}`))
  .catch((e) => {
    console.error(`Backup failed: ${String(e?.message ?? e)}`);
    process.exit(1);
  });
