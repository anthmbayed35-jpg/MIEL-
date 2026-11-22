import { expect, test } from "@playwright/test";
import { inspect, newContext, shot, signIn, targets, verdict, VIEWPORTS, writeResults, type Evidence, type Target } from "./qa-lib";

/**
 * STEP 2: every page in the route inventory, at 1440px and 375px, in a real browser against the production build and the large fake
 * database. For each page and viewport: HTTP status, console errors and warnings, failed requests, horizontal overflow, tap targets
 * (48px), text size on a phone, junk text, stack traces, page title, load time, and a screenshot in ./qa-screenshots.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

type Row = Evidence & { inv: string; label: string; url: string; vp: string; pass: boolean; reasons: string[]; screenshot: string };
const rows: Row[] = [];
const all = targets();

for (const vp of VIEWPORTS) {
  test(`every page at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
    const owner = await (await newContext(browser, vp)).newPage();
    await signIn(owner);
    const anon = await (await newContext(browser, vp)).newPage();
    const change = await (await newContext(browser, vp)).newPage();
    await signIn(change, "qa.change@e2e.test", /\/admin\/change-password/);
    const mfa = await (await newContext(browser, vp)).newPage();
    await signIn(mfa, "qa.mfa@e2e.test", /\/admin\/mfa/);

    for (const t of all) {
      const page = t.kind === "admin" || t.kind === "public" ? owner : t.kind === "anon" ? anon : t.kind === "flow-change" ? change : mfa;
      const admin = t.kind !== "public";
      const ev = await inspect(page, t.url, vp, { admin, expected: t.expected });
      const v = verdict(ev, vp, t.expected ?? 200);
      const file = shot(vp, `${t.inv}${t.label ? "_" + t.label : ""}`);
      await page.screenshot({ path: file, fullPage: true });
      rows.push({ ...ev, inv: t.inv, label: t.label, url: t.url, vp: vp.name, pass: v.pass, reasons: v.reasons, screenshot: file });
      console.log(`${v.pass ? "PASS" : "FAIL"} ${vp.name} ${t.url} ${ev.loadMs}ms${v.pass ? "" : " :: " + v.reasons.join("; ")}`);
    }
    writeResults("pages", rows);
  });
}

test("every inventory page was visited at both viewports", () => {
  const missing: string[] = [];
  const inv = new Set(all.map((t: Target) => t.inv));
  for (const p of inv) for (const vp of VIEWPORTS) if (!rows.some((r) => r.inv === p && r.vp === vp.name)) missing.push(`${p} @ ${vp.name}`);
  expect(missing).toEqual([]);
  const failing = rows.filter((r) => !r.pass);
  writeResults("pages", rows);
  expect(failing.map((r) => `${r.vp} ${r.url}: ${r.reasons.join("; ")}`)).toEqual([]);
});
