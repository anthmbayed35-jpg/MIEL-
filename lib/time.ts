/** The store's time zone. Months, days and CSV date columns are in this zone, never in UTC. */
export const STORE_TZ = "Asia/Beirut";

/** Offset of `tz` from UTC at this instant, in milliseconds (positive east of Greenwich). DST aware. */
export function tzOffsetMs(at: Date, tz = STORE_TZ): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant at which local midnight of y-m-d happens in `tz`. */
export function zonedMidnight(y: number, m: number, d: number, tz = STORE_TZ): Date {
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  let t = naive - tzOffsetMs(new Date(naive), tz);
  t = naive - tzOffsetMs(new Date(t), tz); // second pass settles the DST edge
  return new Date(t);
}

/** [from, to) of a calendar month "YYYY-MM" in the store's time zone, as UTC instants. */
export function monthRange(month: string, tz = STORE_TZ): { from: Date; to: Date } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new Error("Pick a month.");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { from: zonedMidnight(y, mo, 1, tz), to: zonedMidnight(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, 1, tz) };
}

/** "2026-12-31 23:30" style local date-time of an ISO instant in the store's zone (for CSV and screens). */
export function localStamp(iso: string | null, tz = STORE_TZ): string {
  if (!iso) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Calendar parts of an instant in the store's zone. */
export function zonedParts(at: number | Date, tz = STORE_TZ) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
}

/** Local midnight (store zone) of the day that contains `at`, shifted by `addDays` calendar days (DST safe: a day can be 23 or 25 hours). */
export function startOfDay(at: number | Date = Date.now(), addDays = 0, tz = STORE_TZ): number {
  const { y, m, d } = zonedParts(at, tz);
  return zonedMidnight(y, m, d + addDays, tz).getTime();
}
