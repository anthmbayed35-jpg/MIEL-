import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEngine } from "../../lib/db/core";
import { GET } from "@/app/api/health/route";
import { runBackup } from "@/lib/backup";
import { resetState, testDir } from "../support/state";

beforeEach(() => resetState());
afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("200 when the database answers a real query and the volume is writable; reports the backup age", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", db: "ok", volume: "writable", backupAgeHours: null });
    await runBackup();
    expect((await (await GET()).json()).backupAgeHours).toBeLessThan(0.1);
  });

  it("503 with NO details when the database is broken", async () => {
    getEngine().sqlite.exec("DROP TABLE migrations");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("503 with no details when the volume is not writable", async () => {
    const real = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p).includes(".health-")) throw new Error("EROFS: read-only file system, open '/data/.health-1' secret-path");
      return (real as (...a: unknown[]) => void)(p, ...rest);
    }) as typeof fs.writeFileSync);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toBe('{"status":"error"}');
    expect(body).not.toMatch(/EROFS|secret-path|data/);
  });

  it("leaves no probe files behind", async () => {
    await GET();
    await GET();
    expect(fs.readdirSync(testDir()).filter((f) => f.startsWith(".health-"))).toEqual([]);
    void path;
  });
});
