import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/queries";
import { localStamp, monthRange, tzOffsetMs, zonedMidnight } from "@/lib/time";

const h = (ms: number) => ms / 3_600_000;

describe("Asia/Beirut time", () => {
  it("is UTC+2 in winter and UTC+3 in summer (daylight saving)", () => {
    expect(h(tzOffsetMs(new Date("2026-01-15T12:00:00Z")))).toBe(2);
    expect(h(tzOffsetMs(new Date("2026-07-15T12:00:00Z")))).toBe(3);
  });

  it("a calendar month starts at local midnight, in UTC terms", () => {
    expect(monthRange("2026-12").from.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(monthRange("2026-12").to.toISOString()).toBe("2026-12-31T22:00:00.000Z");
    expect(monthRange("2026-07").from.toISOString()).toBe("2026-06-30T21:00:00.000Z"); // summer time: +3
    expect(monthRange("2026-03").to.toISOString()).toBe("2026-03-31T21:00:00.000Z"); // the clocks changed on 29 March
    expect(monthRange("2026-03").from.toISOString()).toBe("2026-02-28T22:00:00.000Z");
  });

  it("months tile the year with no gap and no overlap", () => {
    for (let m = 1; m <= 12; m++) {
      const a = monthRange(`2026-${String(m).padStart(2, "0")}`);
      const next = monthRange(m === 12 ? "2027-01" : `2026-${String(m + 1).padStart(2, "0")}`);
      expect(a.to.getTime()).toBe(next.from.getTime());
    }
  });

  it("rejects things that are not a month", () => {
    for (const bad of ["", "2026", "2026-13", "2026-00", "26-01", "2026-1", "x", "2026-01-01"]) expect(() => monthRange(bad), bad).toThrow("Pick a month.");
  });

  it("local midnight and local stamps", () => {
    expect(zonedMidnight(2026, 12, 1).toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(localStamp("2026-12-31T21:30:00.000Z")).toBe("2026-12-31 23:30");
    expect(localStamp("2026-12-31T22:30:00.000Z")).toBe("2027-01-01 00:30");
    expect(localStamp(null)).toBe("");
  });
});

describe("CSV cells are safe against spreadsheet formula injection", () => {
  it("text that starts with = + - @ tab or CR is defused with an apostrophe", () => {
    for (const evil of ['=HYPERLINK("http://x.example","a")', "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0", "@SUM(1+1)", "\t=1+1", "\r=1+1", "=1+1", "+CMD", "-CMD", "@x"])
      expect(csvCell(evil), evil).toMatch(/^"'/);
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
  });
  it("normal text, numbers and phone-style values are untouched", () => {
    expect(csvCell("Rami Khoury")).toBe('"Rami Khoury"');
    expect(csvCell(12.5)).toBe('"12.5"');
    expect(csvCell(-3)).toBe('"-3"'); // a real negative number
    expect(csvCell("+961 70 123 456")).toBe('"+961 70 123 456"');
    expect(csvCell("-12.50")).toBe('"-12.50"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});
