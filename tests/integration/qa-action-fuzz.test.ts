import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const ROOT = path.resolve(__dirname, "../..");
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name === "actions.ts" ? [path.join(d, e.name)] : []));

const NASTY = ["", " ", "0", "-1", "99999999999999999999", "NaN", "null", "undefined", "<script>alert(1)</script>", "'; DROP TABLE orders; --", "%_\\", "x".repeat(5000), "\u0000‮", "not-a-uuid", "2020-13-45", "{\"a\":1}", "[]"];
const FIELDS = ["id", "version", "to", "name", "phone", "address", "region", "code", "type", "value", "fee", "free_over", "qty", "delta", "reason", "note", "text", "email", "role", "price", "slug", "status", "tags", "notes", "kind", "src", "alt", "label", "act", "intent", "tracking", "partner", "threshold", "lot_number", "quantity", "starts_at", "ends_at", "usage_limit", "min_order", "item", "product", "password", "current", "next"];

/** Raw database or runtime errors must never reach a person; these are the only things an action may throw. */
const ALLOWED = /^(HTTP_40[134]|NEXT_REDIRECT)/;
const RAW = /SQLITE|constraint|no such|TypeError|ReferenceError|Cannot read|is not a function|undefined|at .*\.(ts|js):\d+|\bstack\b/i;

beforeEach(async () => {
  resetState();
  await seedStore();
  h.user = { id: ID.owner, email: "owner@t.test" };
});

describe("server actions survive garbage input", () => {
  it("empty and hostile form data: a clean message or a clean refusal, never a raw crash or stack trace", async () => {
    const bad: string[] = [];
    let called = 0;
    const skip = /::(logout|logoutEverywhere|backupNow|seedStoreAction)$/;
    for (const file of files(path.join(ROOT, "app/admin"))) {
      const rel = path.relative(path.join(ROOT, "app/admin"), file).replaceAll("\\", "/").replace(/^\(app\)\//, "").replace(/\.ts$/, "");
      if (rel.startsWith("(flow)")) continue;
      const mod = await import(/* @vite-ignore */ file.split(path.sep).join("/"));
      for (const [name, fn] of Object.entries(mod) as [string, (...a: any[]) => Promise<any>][]) {
        if (typeof fn !== "function" || skip.test(`${rel}::${name}`)) continue;
        const payloads = [new FormData(), ...NASTY.map((v) => { const fd = new FormData(); for (const f of FIELDS) fd.set(f, v); return fd; })];
        for (const fd of payloads) {
          called++;
          try {
            const r = await fn(null, fd);
            const msg = String(r?.error ?? "");
            if (RAW.test(msg) || msg.length > 400) bad.push(`${rel}::${name} returned "${msg.slice(0, 120)}"`);
          } catch (e) {
            const m = (e as Error).message ?? String(e);
            if (!ALLOWED.test(m)) bad.push(`${rel}::${name} threw "${m.slice(0, 120)}"`);
          }
        }
      }
    }
    expect(called).toBeGreaterThan(300);
    expect([...new Set(bad)]).toEqual([]);
  }, 60_000);
});
