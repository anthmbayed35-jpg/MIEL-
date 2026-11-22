import fs from "node:fs";
import path from "node:path";
import { inventory } from "../support/qa-inventory";
import { QA_RESULTS } from "./qa-env";

/**
 * Fills the GENERATED sections of docs/ADMIN-QA-REPORT.md from the raw results of the last `npm run qa:admin` run.
 * Usage: npx tsx tests/qa/make-report.ts      (the hand-written sections of the report are never touched)
 * Strict rule: a page with no recorded result is NOT TESTED, never PASS.
 */
const ROOT = path.resolve(__dirname, "../..");
const DOC = path.join(ROOT, "docs/ADMIN-QA-REPORT.md");
const read = <T>(n: string): T | null => (fs.existsSync(path.join(QA_RESULTS, `${n}.json`)) ? (JSON.parse(fs.readFileSync(path.join(QA_RESULTS, `${n}.json`), "utf8")) as T) : null);

type PageRow = { inv: string; label: string; url: string; vp: string; pass: boolean; reasons: string[]; console: string[]; failed: string[]; loadMs: number; status: number; screenshot: string };
type Inter = { vp: string; page: string; interaction: string; ok: boolean; note: string };
type DataCheck = { page: string; what: string; screen: unknown; sql: unknown; ok: boolean };
type Perf = { url: string; inv: string; loadMs: number; fcpMs: number; lcpMs: number; tbtMs: number; interactiveMs: number; kb: number; pass: boolean };

const pages = read<PageRow[]>("pages") ?? [];
const inter = read<Inter[]>("interactions") ?? [];
const data = read<DataCheck[]>("data") ?? [];
const perf = read<Perf[]>("perf") ?? [];
const inv = inventory();

const mark = (v: boolean | undefined) => (v === undefined ? "NOT TESTED" : v ? "PASS" : "FAIL");
function pageStatus(invPath: string, vp: string): boolean | undefined {
  const rs = pages.filter((p) => p.inv === invPath && p.vp === vp);
  return rs.length ? rs.every((r) => r.pass) : undefined;
}
const errorsFor = (invPath: string) => pages.filter((p) => p.inv === invPath).reduce((n, p) => n + p.console.length + p.failed.length, 0);
const tested = (invPath: string) => pages.some((p) => p.inv === invPath);

function pagesTable(list: string[]) {
  const head = "| Page | Desktop 1440px | Phone 375px | Console errors + failed requests | Load ms (desktop) | Phone interactive est. ms | Notes |\n|---|---|---|---|---|---|---|";
  const rows = list.map((p) => {
    const d = pages.filter((r) => r.inv === p && r.vp === "desktop");
    const load = d.length ? Math.max(...d.map((r) => r.loadMs)) : "";
    const pf = perf.filter((r) => r.inv === p);
    const ph = pf.length ? Math.max(...pf.map((r) => r.interactiveMs)) : "";
    const fails = pages.filter((r) => r.inv === p && !r.pass).map((r) => `${r.vp}: ${r.reasons.join("; ")}`);
    const variants = [...new Set(pages.filter((r) => r.inv === p).map((r) => r.label).filter(Boolean))];
    const notes = [...(variants.length ? [`variants: ${variants.join(", ")}`] : []), ...fails].join(" · ") || (tested(p) ? "" : "no test visited this page");
    return `| \`${p}\` | ${mark(pageStatus(p, "desktop"))} | ${mark(pageStatus(p, "phone"))} | ${tested(p) ? errorsFor(p) : "—"} | ${load} | ${ph} | ${notes.replace(/\|/g, "/")} |`;
  });
  return [head, ...rows].join("\n");
}

// grep the test code for evidence that an action or route is exercised
const testFiles: { file: string; text: string }[] = [];
(function collect(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (/\.(test|spec)\.ts$/.test(e.name)) testFiles.push({ file: path.relative(ROOT, p).replace(/\\/g, "/"), text: fs.readFileSync(p, "utf8") });
  }
})(path.join(ROOT, "tests"));
const evidence = (needle: string) => testFiles.filter((f) => f.text.includes(needle)).map((f) => f.file.replace(/^tests\//, ""));

function section(name: string, body: string) {
  let doc = fs.readFileSync(DOC, "utf8");
  const a = `<!-- BEGIN:${name} -->`;
  const b = `<!-- END:${name} -->`;
  const i = doc.indexOf(a);
  const j = doc.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers for ${name} missing in the report`);
  doc = doc.slice(0, i + a.length) + "\n" + body.trim() + "\n" + doc.slice(j);
  fs.writeFileSync(DOC, doc);
}

// ---- 1 inventory with ticks
const tick = (ok: boolean) => (ok ? "x" : " ");
section(
  "inventory",
  [
    `### Admin pages (${inv.adminPages.length})`,
    ...inv.adminPages.map((p) => `- [${tick(tested(p))}] \`${p}\``),
    "",
    `### Public pages (${inv.publicPages.length})`,
    ...inv.publicPages.map((p) => `- [${tick(tested(p))}] \`${p}\``),
    "",
    `### API and file routes (${inv.apiRoutes.length})`,
    ...inv.apiRoutes.map((r) => `- [${tick(evidence(r.replace(/\[.*\]/, "")).length > 0)}] \`${r}\``),
    "",
    `### Server actions (${inv.actions.length})`,
    ...inv.actions.map((a) => `- [${tick(evidence(a.name).length > 0)}] \`${a.name}\` (${a.file})`),
  ].join("\n"),
);

// ---- 2 pages
section("pages", ["#### Admin pages", pagesTable(inv.adminPages), "", "#### Public pages", pagesTable(inv.publicPages)].join("\n"));

// ---- 3 routes and actions
section(
  "routes",
  [
    "#### API and file routes",
    "| Route | Test files that exercise it |",
    "|---|---|",
    ...inv.apiRoutes.map((r) => `| \`${r}\` | ${evidence(r.replace(/\[.*\]/, "")).join(", ") || "**NOT TESTED**"} |`),
    "",
    "#### Server actions",
    "| Action | Test files that call or classify it |",
    "|---|---|",
    ...inv.actions.map((a) => `| \`${a.name}\` | ${evidence(a.name).join(", ") || "**NOT TESTED**"} |`),
  ].join("\n"),
);

// ---- 4 interactions
const byPage = new Map<string, Inter[]>();
for (const i of inter) byPage.set(i.page, [...(byPage.get(i.page) ?? []), i]);
section(
  "interactions",
  inter.length
    ? [`${inter.length} recorded interactions (desktop and phone), ${inter.filter((i) => i.ok).length} passed, ${inter.filter((i) => !i.ok).length} failed.`, "", "| Page | Interaction | Desktop | Phone |", "|---|---|---|---|"]
        .concat(
          [...new Set(inter.map((i) => `${i.page}||${i.interaction}`))].map((k) => {
            const [pg, what] = k.split("||");
            const d = inter.find((i) => i.page === pg && i.interaction === what && i.vp === "desktop");
            const p = inter.find((i) => i.page === pg && i.interaction === what && i.vp === "phone");
            const cell = (x?: Inter) => (x ? (x.ok ? "PASS" : `FAIL (${x.note.replace(/\|/g, "/")})`) : "n/a");
            return `| \`${pg}\` | ${what} | ${cell(d)} | ${cell(p)} |`;
          }),
        )
        .join("\n")
    : "NOT RUN",
);

// ---- 5 data checks
section(
  "data",
  data.length
    ? [`${data.length} on-screen numbers compared with independent SQL: ${data.filter((d) => d.ok).length} equal, ${data.filter((d) => !d.ok).length} different.`, "", "| Page | Check | Screen | SQL | Result |", "|---|---|---|---|---|"]
        .concat(
          // one line per page and check family keeps the report readable; failures are always listed in full
          [...new Set(data.map((d) => `${d.page.replace(/\/[0-9a-f-]{36}|QAAFF\d\d|\/partner\/QAAFF\d\d/g, "/<each>")}||${d.what.replace(/QAAFF\d\d /, "")}`))].map((k) => {
            const [pg, what] = k.split("||");
            const rows = data.filter((d) => `${d.page.replace(/\/[0-9a-f-]{36}|QAAFF\d\d|\/partner\/QAAFF\d\d/g, "/<each>")}||${d.what.replace(/QAAFF\d\d /, "")}` === k);
            const bad = rows.find((r) => !r.ok);
            const ex = bad ?? rows[0];
            return `| \`${pg}\` | ${what} (${rows.length}x) | ${String(JSON.stringify(ex.screen)).slice(0, 40)} | ${String(JSON.stringify(ex.sql)).slice(0, 40)} | ${bad ? "FAIL" : "PASS"} |`;
          }),
        )
        .join("\n")
    : "NOT RUN",
);

// ---- 6 performance
section(
  "perf",
  perf.length
    ? ["Mobile profile: 375px, 4x CPU slowdown, 1.6 Mbit/s, 150 ms round trip, cache off. Interactive estimate = max(load, first contentful paint) + total blocking time. Target: under 2000 ms.", "", "| Page | Load ms | First paint ms | Largest paint ms | Blocking ms | Interactive est. ms | KB | Result |", "|---|---|---|---|---|---|---|---|"]
        .concat(perf.map((p) => `| \`${p.url}\` | ${p.loadMs} | ${p.fcpMs} | ${p.lcpMs} | ${p.tbtMs} | ${p.interactiveMs} | ${p.kb} | ${p.pass ? "PASS" : "FAIL"} |`))
        .join("\n")
    : "NOT RUN",
);

const failed = pages.filter((p) => !p.pass).length + inter.filter((i) => !i.ok).length + data.filter((d) => !d.ok).length + perf.filter((p) => !p.pass).length;
console.log(`report sections written. pages ${pages.length} rows, interactions ${inter.length}, data checks ${data.length}, perf ${perf.length}; failing items: ${failed}`);
