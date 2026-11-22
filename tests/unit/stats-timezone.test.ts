import { describe, expect, it } from "vitest";
import { buildSeries } from "@/lib/stats";

const order = (iso: string, total = 50) => ({ id: iso, status: "delivered", is_test: false, total, created_at: iso });

describe("dashboard days follow the store's time zone (Asia/Beirut), not the server's", () => {
  it("an order at 00:30 Beirut on 1 January counts as TODAY at 05:00 Beirut, and an order at 23:30 the evening before is yesterday", () => {
    const now = new Date("2027-01-01T03:00:00.000Z"); // 05:00 in Beirut
    const s = buildSeries([order("2026-12-31T22:30:00.000Z", 70), order("2026-12-31T21:30:00.000Z", 30)] as never, now);
    const week = s.week.map((p) => p.value);
    expect(week[6]).toBe(70); // 1 January in Beirut
    expect(week[5]).toBe(30); // 31 December in Beirut
    expect(s.week[6].tip).toContain("1 January 2027");
    expect(s.month.at(-1)!.value).toBe(70);
  });

  it("works across the spring DST change (a 23-hour day) with no order lost or double counted", () => {
    const now = new Date("2026-04-02T09:00:00.000Z");
    const times = ["2026-03-27T10:00:00.000Z", "2026-03-28T22:30:00.000Z", "2026-03-29T05:00:00.000Z", "2026-03-29T20:59:00.000Z", "2026-03-29T21:01:00.000Z", "2026-04-01T20:59:00.000Z", "2026-04-01T21:01:00.000Z"];
    const s = buildSeries(times.map((t) => order(t, 10)) as never, now);
    expect(s.month.reduce((n, p) => n + p.value, 0)).toBe(70); // all seven, each exactly once
    const byTip = Object.fromEntries(s.month.map((p) => [p.tip, p.value]));
    expect(byTip["Sun, 29 March 2026"]).toBe(30); // 29 Mar local: 03:00 (+3) to the next local midnight, which is 21:00 UTC
  });

  it("the hourly series is labelled with Beirut hours", () => {
    const now = new Date("2026-12-01T10:15:00.000Z"); // 12:15 in Beirut
    const day = buildSeries([] as never, now).day;
    expect(day.at(-1)!.label).toBe("12");
    expect(day).toHaveLength(24);
  });

  it("the 12-month series uses Beirut calendar months", () => {
    const now = new Date("2026-12-15T10:00:00.000Z");
    const s = buildSeries([order("2026-11-30T21:30:00.000Z", 40), order("2026-11-30T22:30:00.000Z", 60)] as never, now);
    const byLabel = Object.fromEntries(s.year.map((p) => [p.label, p.value]));
    expect(byLabel.Nov).toBe(40); // 23:30 on 30 November in Beirut
    expect(byLabel.Dec).toBe(60); // 00:30 on 1 December in Beirut
  });
});
