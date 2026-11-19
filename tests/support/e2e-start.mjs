// Starts the app for the end-to-end tests exactly like Railway does: seed a throwaway database, `npm run build`, then `npm start`.
// Playwright runs this as its webServer and waits for /api/health.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(root, ".data-e2e");
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
run("npx", ["tsx", "--conditions=react-server", "tests/support/e2e-seed.ts"]);
run("npm", ["run", "build"]);
const child = spawn("npm", ["start"], { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: process.env });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
