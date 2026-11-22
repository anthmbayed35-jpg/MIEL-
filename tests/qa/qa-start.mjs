// Seeds the large fake data set into a temp folder, then starts the production build on it (as `npm start` does on Railway).
// The server output goes to a log file that the QA scans for secrets. Playwright waits for /api/health.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = process.env.QA_DIR || join(tmpdir(), "miel-admin-qa");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const seed = spawnSync("npx", ["tsx", "--conditions=react-server", "tests/support/qa-seed.ts", dir, "3000", "2000", "40", "20", "500"], { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, MIEL_ENV: "staging" } });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const log = openSync(join(dir, "server.log"), "a");
const child = spawn(process.execPath, ["scripts/start.mjs"], { cwd: root, stdio: ["ignore", log, log], env: process.env });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
