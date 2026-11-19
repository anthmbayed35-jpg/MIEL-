// `npm start` entry point (what Railway runs). Starts the standalone server on 0.0.0.0:$PORT.
// Railway injects PORT. HOSTNAME must be forced: containers set it to the container id, which would make the
// server listen on an address the Railway proxy cannot reach.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const server = join(process.cwd(), ".next", "standalone", "server.js");
if (!existsSync(server)) {
  console.error("start: .next/standalone/server.js not found. Run `npm run build` first.");
  process.exit(1);
}
const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: "0.0.0.0",
  PORT: process.env.PORT || "3000",
  KEEP_ALIVE_TIMEOUT: process.env.KEEP_ALIVE_TIMEOUT || "65000", // above Railway's proxy idle timeout, avoids sporadic 502s
};
const child = spawn(process.execPath, [server], { stdio: "inherit", env });
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig)); // graceful stop on redeploy
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));

// Don't outlive whoever started us (npm, a shell, a test runner). On Windows killing the parent does not kill its
// children, which left stale servers holding the port and the build folder. Harmless on Railway: npm lives as long as we do.
const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    child.kill("SIGTERM");
    process.exit(0);
  }
}, 2000).unref();
