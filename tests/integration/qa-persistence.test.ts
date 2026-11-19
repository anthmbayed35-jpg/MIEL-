import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { closeEngine, getEngine, migrate } from "../../lib/db/core";
import { restoreFrom, runBackup } from "@/lib/backup";
import { checkLedger } from "@/lib/ledger";
import { resetState, testDir } from "../support/state";
import { qaSeed } from "../support/qa-seed";

const tables = () => (getEngine().sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const counts = () => Object.fromEntries(tables().map((t) => [t, (getEngine().sqlite.prepare(`SELECT COUNT(*) n FROM "${t}"`).get() as { n: number }).n]));

beforeEach(() => resetState());

describe("restart, migrations and restore on a large realistic database", () => {
  it("restarts and re-runs migrations several times without losing or duplicating anything; the ledger balances", async () => {
    await qaSeed(path.join(testDir(), "qa"), { orders: 600, customers: 300, products: 60 });
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
    await qaSeed(path.join(testDir(), "qa"), { orders: 600, customers: 300, products: 60 });
    const before = counts();
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
  });
});
