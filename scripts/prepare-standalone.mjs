// Runs after `next build` (see the "build" script). The standalone server does not include static assets,
// so copy `.next/static` and `public` next to it, exactly as the Next.js docs describe.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, ".next", "standalone");
if (!existsSync(join(out, "server.js"))) {
  console.error("prepare-standalone: .next/standalone/server.js is missing. Did `next build` run with output: \"standalone\"?");
  process.exit(1);
}
cpSync(join(root, ".next", "static"), join(out, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(out, "public"), { recursive: true });
// SQL migrations are read from ./migrations at startup (the standalone server runs from its own folder).
cpSync(join(root, "migrations"), join(out, "migrations"), { recursive: true });
console.log("prepare-standalone: copied .next/static, public and migrations into .next/standalone");
