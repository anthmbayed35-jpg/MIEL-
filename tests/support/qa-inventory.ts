import fs from "node:fs";
import path from "node:path";

/**
 * STEP 1 of the admin QA: walk the route tree and list EVERYTHING a person or a program can reach. A page that is not on this list
 * cannot be missed, and the report generator marks every listed page that no test visited as NOT TESTED.
 */
const ROOT = path.resolve(__dirname, "../..");
const APP = path.join(ROOT, "app");

export type Inventory = {
  adminPages: string[];
  publicPages: string[];
  apiRoutes: string[];
  actions: { file: string; name: string; admin: boolean }[];
};

const urlOf = (dir: string) =>
  "/" + path.relative(APP, dir).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s)).join("/");

function walk(dir: string, out: { page: string[]; route: string[]; action: string[] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "page.tsx") out.page.push(urlOf(dir) === "/" ? "/" : urlOf(dir));
    else if (e.name === "route.ts") out.route.push(urlOf(dir));
    else if (e.name === "actions.ts" || /^[a-z-]+\.ts$/.test(e.name) && dir.endsWith(path.join("app", "actions"))) out.action.push(p);
  }
}

export function inventory(): Inventory {
  const found = { page: [] as string[], route: [] as string[], action: [] as string[] };
  walk(APP, found);
  // metadata files are routes too (opengraph-image, sitemap, robots, icon) but not part of the admin QA
  const actions: Inventory["actions"] = [];
  for (const file of found.action.sort()) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/export async function (\w+)/g)) actions.push({ file: path.relative(ROOT, file).replace(/\\/g, "/"), name: m[1], admin: /app[\\/]admin/.test(file) });
  }
  const sort = (a: string[]) => [...new Set(a)].sort();
  return {
    adminPages: sort(found.page.filter((u) => u.startsWith("/admin"))),
    publicPages: sort(found.page.filter((u) => !u.startsWith("/admin"))),
    apiRoutes: sort(found.route.filter((u) => u.startsWith("/admin") || u.startsWith("/api") || u.startsWith("/uploads"))),
    actions,
  };
}

export function checklistMarkdown(inv = inventory()): string {
  const box = (s: string) => `- [ ] \`${s}\``;
  return [
    `### Admin pages (${inv.adminPages.length})`,
    ...inv.adminPages.map(box),
    "",
    `### Public pages (${inv.publicPages.length})`,
    ...inv.publicPages.map(box),
    "",
    `### API and file routes (${inv.apiRoutes.length})`,
    ...inv.apiRoutes.map(box),
    "",
    `### Server actions (${inv.actions.length})`,
    ...inv.actions.map((a) => `- [ ] \`${a.name}\` (${a.file})`),
  ].join("\n");
}

if (process.argv[1] && /qa-inventory\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  const inv = inventory();
  if (process.argv[2] === "--json") console.log(JSON.stringify(inv, null, 2));
  else console.log(checklistMarkdown(inv));
}
