import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Browser, BrowserContext, ConsoleMessage, Page, Request, Response } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { inventory } from "../support/qa-inventory";
import { QA_DB, QA_RESULTS, QA_SHOTS, QA_URL } from "./qa-env";

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone", width: 375, height: 812, mobile: true },
] as const;
export type Viewport = (typeof VIEWPORTS)[number];

/** Read-only look at the QA database: the independent source of truth that the screens are compared with. */
export function sql<T = Record<string, any>>(q: string, ...p: unknown[]): T[] {
  const db = new Database(QA_DB, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(q).all(...p) as T[];
  } finally {
    db.close();
  }
}
export const one = <T = Record<string, any>>(q: string, ...p: unknown[]) => sql<T>(q, ...p)[0];

export const cents = (text: string) => {
  const m = text.replace(/,/g, "").match(/-?\$?\s*(-?\d+(?:\.\d+)?)/);
  return m ? Math.round(Number(m[1]) * 100) : NaN;
};

let ip = 10;
export const newContext = (browser: Browser, vp: Viewport): Promise<BrowserContext> =>
  browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.mobile,
    isMobile: vp.mobile,
    extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` }, // each browser from its own address (login limits are per IP)
  });

export async function signIn(page: Page, email: string = USERS.owner.email, expectUrl: RegExp = /\/admin(\?.*)?$/) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(expectUrl, { timeout: 30_000 });
}

export type Evidence = {
  console: string[];
  failed: string[];
  overflow: number;
  tapSmall: string[];
  smallText: string[];
  junk: string | null;
  status: number;
  loadMs: number;
  domMs: number;
  title: string;
  notes: string[];
};

/** Everything an auditor wants to know about one page load. Nothing here modifies the page. */
export async function inspect(page: Page, url: string, vp: Viewport, opts: { admin: boolean; expected?: number } = { admin: true }): Promise<Evidence> {
  const ev: Evidence = { console: [], failed: [], overflow: 0, tapSmall: [], smallText: [], junk: null, status: 0, loadMs: 0, domMs: 0, title: "", notes: [] };
  const expected = opts.expected ?? 200;
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    if (expected !== 200 && /status of 40\d/.test(m.text())) return; // the browser logs the intended 404 itself
    ev.console.push(`${m.type()}: ${m.text()}`.slice(0, 240));
  };
  const onError = (e: Error) => ev.console.push(`pageerror: ${e.message}`.slice(0, 240));
  const onResponse = (r: Response) => {
    const u = new URL(r.url());
    if (u.origin === QA_URL && r.status() >= 400 && !(r.request().isNavigationRequest() && r.status() === expected) && !u.pathname.endsWith("/favicon.ico")) ev.failed.push(`${r.status()} ${u.pathname}`);
  };
  const onFail = (r: Request) => {
    if (r.failure()?.errorText !== "net::ERR_ABORTED") ev.failed.push(`${r.failure()?.errorText} ${new URL(r.url()).pathname}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("response", onResponse);
  page.on("requestfailed", onFail);
  try {
    const res = await page.goto(url, { waitUntil: "load" });
    ev.status = res?.status() ?? 0;
    // scroll through so lazy content and reveal animations settle, then give hydration a moment
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const facts = await page.evaluate(
      ({ mobile, admin }) => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const bad: string[] = [];
        const small = new Set<string>();
        if (mobile && admin) {
          for (const el of document.querySelectorAll<HTMLElement>("a,button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]")) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || el.closest("[aria-hidden=true]")) continue;
            if (el.tagName === "A" && el.closest("p,td") && r.height < 40) continue; // inline text link inside a sentence
            if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
              const lr = el.closest("label")?.getBoundingClientRect();
              if (lr && lr.height >= 47.5 && lr.width >= 47.5) continue;
            }
            if (r.height < 47.5 || r.width < 47.5) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const t = n.textContent?.trim();
            const el = n.parentElement;
            if (!t || !el || el.closest("script,style,[aria-hidden=true],svg")) continue;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (cs.display === "none" || cs.visibility === "hidden" || !r.width || !r.height) continue;
            if (parseFloat(cs.fontSize) < 13) small.add(`${el.tagName.toLowerCase()} ${parseFloat(cs.fontSize)}px "${t.slice(0, 20)}"`);
          }
        }
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          bad: [...new Set(bad)].slice(0, 8),
          small: [...small].slice(0, 8),
          text: document.body.innerText,
          title: document.title,
          loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
          domMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0,
        };
      },
      { mobile: vp.mobile, admin: opts.admin },
    );
    ev.overflow = facts.overflow;
    ev.tapSmall = facts.bad;
    ev.smallText = facts.small;
    ev.loadMs = facts.loadMs;
    ev.domMs = facts.domMs;
    ev.title = facts.title;
    const junk = facts.text.match(/\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\bInfinity\b/);
    if (junk) ev.junk = junk[0];
    if (/at \S+ \(.*(\.js|\.ts)[:\d]*\)|node_modules|TypeError:|ReferenceError:|SQLITE_|stack trace/i.test(facts.text)) ev.notes.push("a stack trace or internal error text is visible");
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
    page.off("response", onResponse);
    page.off("requestfailed", onFail);
  }
  return ev;
}

export function verdict(ev: Evidence, vp: Viewport, expected = 200): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ev.status !== expected) reasons.push(`HTTP ${ev.status} (expected ${expected})`);
  if (ev.console.length) reasons.push(`${ev.console.length} console error/warning: ${ev.console[0]}`);
  if (ev.failed.length) reasons.push(`failed request: ${ev.failed[0]}`);
  if (ev.overflow > 1) reasons.push(`horizontal overflow ${ev.overflow}px`);
  if (vp.mobile && ev.tapSmall.length) reasons.push(`tap target under 48px: ${ev.tapSmall[0]}`);
  if (vp.mobile && ev.smallText.length) reasons.push(`text under 13px: ${ev.smallText[0]}`);
  if (ev.junk) reasons.push(`junk text "${ev.junk}"`);
  if (!ev.title.trim()) reasons.push("empty <title>");
  for (const n of ev.notes) reasons.push(n);
  return { pass: reasons.length === 0, reasons };
}

export function shot(vp: Viewport, name: string) {
  const dir = path.join(QA_SHOTS, vp.name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}.png`);
}

/** Append-safe results file per spec (each spec writes its own, the report generator merges them). */
export function writeResults(name: string, data: unknown) {
  fs.mkdirSync(QA_RESULTS, { recursive: true });
  fs.writeFileSync(path.join(QA_RESULTS, `${name}.json`), JSON.stringify(data, null, 2));
}
export const readResults = <T>(name: string): T | null => {
  const f = path.join(QA_RESULTS, `${name}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as T) : null;
};

export type Target = { inv: string; url: string; label: string; kind: "admin" | "public" | "anon" | "flow-change" | "flow-mfa"; expected?: number };

/** Every page of the inventory, made concrete with real ids from the database (a page can have several variants). */
export function targets(): Target[] {
  const inv = inventory();
  const aff = sql<{ id: string; token: string; corr: number }>("SELECT a.id, a.private_token AS token, (SELECT COUNT(*) FROM orders o WHERE o.affiliate_id = a.id AND o.commission_status = 'void' AND o.commission_payout_id IS NOT NULL) AS corr FROM affiliates a ORDER BY a.code");
  const withCorr = aff.find((a) => a.corr > 0) ?? aff[0];
  const withoutCorr = aff.find((a) => a.corr === 0) ?? aff[1];
  const affOrder = one<{ id: string }>("SELECT id FROM orders WHERE affiliate_id IS NOT NULL AND commission_status = 'paid' LIMIT 1")?.id ?? "none";
  const plainOrder = one<{ id: string }>("SELECT id FROM orders WHERE affiliate_id IS NULL AND status = 'delivered' ORDER BY created_at DESC LIMIT 1")?.id ?? "none";
  const product = one<{ id: string }>("SELECT id FROM products WHERE slug = 'red-burn'")?.id ?? "none";
  const customer = one<{ id: string }>("SELECT customer_id AS id FROM orders GROUP BY customer_id ORDER BY COUNT(*) DESC LIMIT 1")?.id ?? "none";
  const out: Target[] = [];
  const add = (invPath: string, url: string, label: string, kind: Target["kind"] = "admin", expected?: number) => out.push({ inv: invPath, url, label, kind, expected });
  for (const p of inv.adminPages) {
    switch (p) {
      case "/admin/orders/[id]":
        add(p, `/admin/orders/${affOrder}`, "paid affiliate order");
        add(p, `/admin/orders/${plainOrder}`, "plain delivered order");
        break;
      case "/admin/products/[id]": add(p, `/admin/products/${product}`, "RED BURN"); break;
      case "/admin/customers/[id]": add(p, `/admin/customers/${customer}`, "top customer"); break;
      case "/admin/affiliates/[id]":
        add(p, `/admin/affiliates/${withCorr.id}`, "affiliate with a correction");
        add(p, `/admin/affiliates/${withoutCorr.id}`, "affiliate without one");
        break;
      case "/admin/print":
        add(p, `/admin/print?type=packing&ids=${affOrder}`, "packing slip");
        add(p, `/admin/print?type=invoice&ids=${plainOrder}`, "invoice");
        break;
      case "/admin/login": add(p, "/admin/login", "signed out", "anon"); break;
      case "/admin/forgot": add(p, "/admin/forgot", "signed out", "anon"); break;
      case "/admin/set-password": add(p, "/admin/set-password?type=invite&token=not-a-real-token", "bad link", "anon"); break;
      case "/admin/change-password": add(p, "/admin/change-password", "member who must change the temporary password", "flow-change"); break;
      case "/admin/mfa": add(p, "/admin/mfa", "member who must enrol two-factor", "flow-mfa"); break;
      default: add(p, p, "");
    }
  }
  for (const p of inv.publicPages) {
    switch (p) {
      case "/partner/[token]": add(p, `/partner/${withCorr.token}`, "affiliate with a correction", "public"); break;
      case "/products/[slug]": add(p, "/products/red-burn", "RED BURN", "public"); break;
      case "/policies/[slug]": add(p, "/policies/shipping", "shipping policy", "public"); break;
      case "/maintenance": add(p, "/maintenance", "storefront live: the page is hidden (404 by design)", "public", 404); break;
      default: add(p, p, "", "public");
    }
  }
  return out;
}
