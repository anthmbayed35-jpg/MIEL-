import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { closeEngine, getEngine, migrate } from "../../lib/db/core";
import { restoreFrom, runBackup } from "@/lib/backup";
import { checkLedger } from "@/lib/ledger";
import { checkAffiliateBooks, listAffiliates, overview } from "@/lib/affiliates";
import { resetState, testDir } from "../support/state";
import { qaSeed } from "../support/qa-seed";

const tables = () => (getEngine().sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const counts = () => Object.fromEntries(tables().map((t) => [t, (getEngine().sqlite.prepare(`SELECT COUNT(*) n FROM "${t}"`).get() as { n: number }).n]));

const balance = (a: { id: string; sales_cents: number; pending_cents: number; approved_cents: number; paid_cents: number; corrections_cents: number }) => ({ id: a.id, sales: a.sales_cents, pending: a.pending_cents, approved: a.approved_cents, paid: a.paid_cents, corrections: a.corrections_cents });

beforeEach(() => resetState());

describe("restart, migrations and restore on a large realistic database", () => {
  it("restarts and re-runs migrations several times without losing or duplicating anything; the ledger balances", async () => {
    await qaSeed(path.join(testDir(), "qa"), { orders: 600, customers: 300, products: 60, affiliates: 20, affiliateOrders: 150 });
    const before = (closeEngine(), counts());
    expect(before.orders).toBe(600);
    for (let i = 0; i < 4; i++) {
      closeEngine(); // the app is restarted
      const e = getEngine(); // boot opens the file and migrates
      expect(migrate(e.sqlite)).toEqual([]); // nothing left to apply, nothing re-applied
      expect(counts()).toEqual(before);
      expect(e.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(checkLedger()).toEqual([]);
    }
  });

  it("backup, restore into a fresh folder: every table has the same number of records", async () => {
    await qaSeed(path.join(testDir(), "qa"), { orders: 600, customers: 300, products: 60, affiliates: 20, affiliateOrders: 150 });
    const before = counts();
    expect(before.affiliates).toBe(20);
    expect(checkAffiliateBooks()).toEqual([]); // the seed itself is consistent
    const balancesBefore = listAffiliates().map(balance);
    const overviewBefore = overview();
    expect(overviewBefore.paid_cents).toBeGreaterThan(0);
    expect(overviewBefore.corrections_cents + 1).toBeGreaterThan(0);
    const snap = await runBackup();
    closeEngine();

    const fresh = path.join(testDir(), "fresh-volume");
    fs.mkdirSync(fresh, { recursive: true });
    process.env.DATABASE_PATH = path.join(fresh, "miel.db");
    const r = restoreFrom(snap.path);
    expect(r.restoredTables).toBeGreaterThan(20);
    expect(counts()).toEqual(before);
    expect(checkLedger()).toEqual([]);
    expect(getEngine().sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    // affiliate balances come back to the cent, and the books still balance
    expect(listAffiliates().map(balance)).toEqual(balancesBefore);
    expect(overview()).toEqual(overviewBefore);
    expect(checkAffiliateBooks()).toEqual([]);
  });
});
