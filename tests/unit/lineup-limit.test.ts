import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_LINEUP_LIMIT } from "@/lib/lineup";

describe("home lineup cap", () => {
  it("is a plain number a server component can use", () => {
    expect(HOME_LINEUP_LIMIT).toBe(12);
    // exported from a "use client" file it became a client reference and slice(0, ref) emptied the whole lineup
    const client = fs.readFileSync(path.resolve(__dirname, "../../components/Lineup.tsx"), "utf8");
    expect(client).toMatch(/^"use client"/);
    expect(client).not.toMatch(/export const HOME_LINEUP_LIMIT/);
  });
});
