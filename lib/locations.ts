import "server-only";
import crypto from "node:crypto";
import { getEngine } from "./db";
import type { IndexData } from "./place-search";
import { foldArabic, foldEnglish, placeMatches } from "./search-text";

/**
 * Lebanon locations (table `locations`, seeded by migration 0010 from the official open data): governorate -> district (caza) -> region
 * (city, town, village, Beirut neighbourhood). Hidden places are not offered at checkout. Everything the checkout accepts is checked
 * here, on the server: the region must belong to the district and the district to the governorate, and none of them may be hidden.
 */
const sqlite = () => getEngine().sqlite;

export type LocationRow = { id: string; parent_id: string | null; type: "governorate" | "district" | "region"; code: string; name_en: string; name_ar: string; official_name_en: string; hidden: number; custom: number; version: number };
export type Place = { id: string; en: string; ar: string };
export type CheckoutDistrict = Place;
export type CheckoutGovernorate = Place & { districts: CheckoutDistrict[] };

/** Governorates and districts offered at checkout: not hidden, and (for a district) with at least one region to choose. */
export function checkoutTree(): CheckoutGovernorate[] {
  const govs = sqlite().prepare("SELECT id, name_en, name_ar FROM locations WHERE type = 'governorate' AND hidden = 0 ORDER BY name_en").all() as { id: string; name_en: string; name_ar: string }[];
  const dists = sqlite()
    .prepare(
      `SELECT d.id, d.parent_id, d.name_en, d.name_ar FROM locations d
       WHERE d.type = 'district' AND d.hidden = 0 AND EXISTS (SELECT 1 FROM locations r WHERE r.parent_id = d.id AND r.type = 'region' AND r.hidden = 0)
       ORDER BY d.name_en`,
    )
    .all() as { id: string; parent_id: string; name_en: string; name_ar: string }[];
  return govs
    .map((g) => ({ id: g.id, en: g.name_en, ar: g.name_ar, districts: dists.filter((d) => d.parent_id === g.id).map((d) => ({ id: d.id, en: d.name_en, ar: d.name_ar })) }))
    .filter((g) => g.districts.length > 0);
}

/** Every visible region of ONE district (and only that district). */
export function regionsOf(districtId: string): Place[] {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(districtId)) return [];
  const ok = sqlite().prepare("SELECT 1 FROM locations WHERE id = ? AND type = 'district' AND hidden = 0").get(districtId);
  if (!ok) return [];
  return (sqlite().prepare("SELECT id, name_en, name_ar FROM locations WHERE parent_id = ? AND type = 'region' AND hidden = 0 ORDER BY name_en").all(districtId) as { id: string; name_en: string; name_ar: string }[]).map((r) => ({ id: r.id, en: r.name_en, ar: r.name_ar }));
}

export type ResolvedLocation = {
  governorate: { id: string; name: string };
  district: { id: string; name: string };
  region: { id: string; name: string };
};

/** The three ids from the browser, checked. Returns the names to store on the order, or an error message and the field it belongs to. */
export function resolveLocation(ids: { governorateId: string; districtId: string; regionId: string }): { ok: true; value: ResolvedLocation } | { ok: false; error: string; field: "governorate" | "district" | "region" } {
  const get = (id: string, type: string) =>
    /^[A-Za-z0-9_-]{1,40}$/.test(String(id ?? ""))
      ? (sqlite().prepare("SELECT id, parent_id, name_en, hidden FROM locations WHERE id = ? AND type = ?").get(id, type) as { id: string; parent_id: string | null; name_en: string; hidden: number } | undefined)
      : undefined;
  const g = get(ids.governorateId, "governorate");
  if (!g || g.hidden) return { ok: false, error: "Choose your governorate.", field: "governorate" };
  const d = get(ids.districtId, "district");
  if (!d || d.hidden || d.parent_id !== g.id) return { ok: false, error: "Choose your district from the list for that governorate.", field: "district" };
  const r = get(ids.regionId, "region");
  if (!r || r.hidden || r.parent_id !== d.id) return { ok: false, error: "Choose your town or village from the list for that district.", field: "region" };
  return { ok: true, value: { governorate: { id: g.id, name: g.name_en }, district: { id: d.id, name: d.name_en }, region: { id: r.id, name: r.name_en } } };
}

/** Governorate and district only (for an area that is not in the list): the district must belong to the governorate and neither may be hidden. */
export function resolveDistrict(governorateId: string, districtId: string): { ok: true; governorate: { id: string; name: string }; district: { id: string; name: string } } | { ok: false; error: string; field: "governorate" | "district" } {
  const get = (id: string, type: string) => (/^[A-Za-z0-9_-]{1,40}$/.test(String(id ?? "")) ? (sqlite().prepare("SELECT id, parent_id, name_en, hidden FROM locations WHERE id = ? AND type = ?").get(id, type) as { id: string; parent_id: string | null; name_en: string; hidden: number } | undefined) : undefined);
  const g = get(governorateId, "governorate");
  if (!g || g.hidden) return { ok: false, error: "Choose your governorate.", field: "governorate" };
  const d = get(districtId, "district");
  if (!d || d.hidden || d.parent_id !== g.id) return { ok: false, error: "Choose your district from the list for that governorate.", field: "district" };
  return { ok: true, governorate: { id: g.id, name: g.name_en }, district: { id: d.id, name: d.name_en } };
}

// ---------------------------------------------------------------- admin
export type DistrictSummary = { id: string; name_en: string; name_ar: string; hidden: number; version: number; regions: number; visible: number };
export function adminTree() {
  const govs = sqlite().prepare("SELECT id, name_en, name_ar, hidden, version FROM locations WHERE type = 'governorate' ORDER BY name_en").all() as { id: string; name_en: string; name_ar: string; hidden: number; version: number }[];
  const dists = sqlite()
    .prepare(
      `SELECT d.id, d.parent_id, d.name_en, d.name_ar, d.hidden, d.version,
              (SELECT COUNT(*) FROM locations r WHERE r.parent_id = d.id AND r.type = 'region') AS regions,
              (SELECT COUNT(*) FROM locations r WHERE r.parent_id = d.id AND r.type = 'region' AND r.hidden = 0) AS visible
       FROM locations d WHERE d.type = 'district' ORDER BY d.name_en`,
    )
    .all() as (DistrictSummary & { parent_id: string })[];
  return govs.map((g) => ({ ...g, districts: dists.filter((d) => d.parent_id === g.id), regions: dists.filter((d) => d.parent_id === g.id).reduce((n, d) => n + d.regions, 0) }));
}

export function adminRegions(districtId: string, q = "", limit = 400) {
  const all = sqlite().prepare("SELECT id, name_en, name_ar, official_name_en, hidden, custom, version, aliases, source FROM locations WHERE parent_id = ? AND type = 'region' ORDER BY name_en").all(districtId) as (Pick<LocationRow, "id" | "name_en" | "name_ar" | "official_name_en" | "hidden" | "custom" | "version"> & { aliases: string; source: string })[];
  return { total: all.length, rows: all.filter((r) => placeMatchesAdmin(r, q)).slice(0, limit) };
}

const aliasList = (json: string | undefined): string[] => {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const placeMatchesAdmin = (r: { name_en: string; name_ar: string; official_name_en: string; aliases?: string }, q: string) =>
  placeMatches({ en: r.name_en, ar: r.name_ar }, q) || (!!q.trim() && (placeMatches({ en: r.official_name_en }, q) || aliasList(r.aliases).some((a) => placeMatches({ en: a, ar: a }, q))));

/** Search every place by name (English or Arabic, also the original official name) for the admin. */
export function searchLocations(q: string, limit = 60) {
  const rows = sqlite()
    .prepare(
      `SELECT l.id, l.type, l.name_en, l.name_ar, l.official_name_en, l.hidden, l.custom, l.version, l.aliases,
              d.name_en AS district, g.name_en AS governorate
       FROM locations l
       LEFT JOIN locations d ON d.id = CASE l.type WHEN 'region' THEN l.parent_id WHEN 'district' THEN l.id END
       LEFT JOIN locations g ON g.id = CASE l.type WHEN 'region' THEN d.parent_id WHEN 'district' THEN l.parent_id ELSE l.id END
       ORDER BY l.type, l.name_en`,
    )
    .all() as { id: string; type: string; name_en: string; name_ar: string; official_name_en: string; hidden: number; custom: number; version: number; aliases: string; district: string | null; governorate: string | null }[];
  return rows.filter((r) => placeMatchesAdmin(r, q)).slice(0, limit);
}

const clean = (s: string, max = 80) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Aliases from a text box: one per line or comma separated, cleaned, no duplicates, at most 20. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[\n,;|]/)) {
    const a = clean(raw, 60);
    const k = /[\u0600-\u06FF]/.test(a) ? foldArabic(a) : foldEnglish(a);
    if (a.length < 2 || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
    if (out.length >= 20) break;
  }
  return out;
}

export function renameLocation(id: string, nameEn: string, nameAr: string, version?: number, aliases?: string[]) {
  const en = clean(nameEn);
  if (en.length < 2) throw new Error("Give the place a name (at least 2 letters).");
  const ar = clean(nameAr);
  const row = sqlite().prepare("SELECT id, type, parent_id, version FROM locations WHERE id = ?").get(id) as { id: string; type: string; parent_id: string | null; version: number } | undefined;
  if (!row) throw new Error("That place no longer exists.");
  if (version !== undefined && version !== row.version) throw new Error("This was changed elsewhere since you opened it. Reload the page and try again.");
  const dup = sqlite().prepare("SELECT 1 FROM locations WHERE type = ? AND parent_id IS ? AND lower(name_en) = lower(?) AND id <> ?").get(row.type, row.parent_id, en, id);
  if (dup) throw new Error("Another place with that name already exists here.");
  sqlite().prepare("UPDATE locations SET name_en = ?, name_ar = ?, aliases = COALESCE(?, aliases), version = version + 1, updated_at = ? WHERE id = ?").run(en, ar, aliases ? JSON.stringify(aliases.filter((a) => foldEnglish(a) !== foldEnglish(en))) : null, new Date().toISOString(), id);
}

export function setLocationHidden(id: string, hidden: boolean) {
  const r = sqlite().prepare("UPDATE locations SET hidden = ?, version = version + 1, updated_at = ? WHERE id = ? AND type IN ('district','region')").run(hidden ? 1 : 0, new Date().toISOString(), id);
  if (!r.changes) throw new Error("Only districts and regions can be hidden or shown.");
}

/** Add a region the official list does not have. Belongs to exactly one district. */
export function addRegion(districtId: string, nameEn: string, nameAr: string, aliases: string[] = [], source = "manual"): string {
  const en = clean(nameEn);
  if (en.length < 2) throw new Error("Give the region a name (at least 2 letters).");
  const d = sqlite().prepare("SELECT id FROM locations WHERE id = ? AND type = 'district'").get(districtId);
  if (!d) throw new Error("Choose a district.");
  if (sqlite().prepare("SELECT 1 FROM locations WHERE parent_id = ? AND type = 'region' AND lower(name_en) = lower(?)").get(districtId, en)) throw new Error("That region already exists in this district.");
  const id = `X${crypto.randomBytes(6).toString("hex")}`;
  sqlite().prepare("INSERT INTO locations (id, parent_id, type, code, name_en, name_ar, official_name_en, custom, aliases, source) VALUES (?, ?, 'region', '', ?, ?, '', 1, ?, ?)").run(id, districtId, en, clean(nameAr), JSON.stringify(aliases), source);
  return id;
}

// ---------------------------------------------------------------- the search index (downloaded once by the checkout)
/** Everything the checkout needs to search ALL regions in the browser: governorates, districts and visible regions with their aliases. */
export function searchIndex(): IndexData {
  const govs = sqlite().prepare("SELECT id, name_en, name_ar FROM locations WHERE type = 'governorate' AND hidden = 0 ORDER BY id").all() as { id: string; name_en: string; name_ar: string }[];
  const dists = sqlite()
    .prepare(
      `SELECT d.id, d.parent_id, d.name_en, d.name_ar FROM locations d
       WHERE d.type = 'district' AND d.hidden = 0 AND EXISTS (SELECT 1 FROM locations r WHERE r.parent_id = d.id AND r.type = 'region' AND r.hidden = 0)
       ORDER BY d.id`,
    )
    .all() as { id: string; parent_id: string; name_en: string; name_ar: string }[];
  const gIndex = new Map(govs.map((g, i) => [g.id, i]));
  const usable = dists.filter((d) => gIndex.has(d.parent_id));
  const dIndex = new Map(usable.map((d, i) => [d.id, i]));
  const regions = sqlite().prepare("SELECT id, parent_id, name_en, name_ar, weight, aliases FROM locations WHERE type = 'region' AND hidden = 0 ORDER BY name_en").all() as { id: string; parent_id: string; name_en: string; name_ar: string; weight: number; aliases: string }[];
  const clip = (a: string) => a.replace(/\|/g, " ");
  return {
    v: searchIndexVersion(),
    g: govs.map((g) => [g.id, g.name_en, g.name_ar]),
    d: usable.map((d) => [d.id, gIndex.get(d.parent_id)!, d.name_en, d.name_ar]),
    r: regions.filter((r) => dIndex.has(r.parent_id)).map((r) => [r.id, dIndex.get(r.parent_id)!, r.name_en, r.name_ar, r.weight, aliasList(r.aliases).map(clip).join("|")]),
  };
}

/** Changes whenever anything in the list changes (a rename, hide, new region, alias): the browser cache key of the index. */
export function searchIndexVersion(): string {
  const r = sqlite().prepare("SELECT COUNT(*) AS n, COALESCE(SUM(version), 0) AS v, COALESCE(SUM(hidden), 0) AS h, COALESCE(MAX(updated_at), '') AS u FROM locations").get() as { n: number; v: number; h: number; u: string };
  return crypto.createHash("sha1").update(`${r.n}|${r.v}|${r.h}|${r.u}`).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------- "my area is not listed"
const cleanText = (s: string) => clean(s, 60);
const foldAny = (s: string) => (/[\u0600-\u06FF]/.test(s) ? foldArabic(s) : foldEnglish(s));

export type UnlistedRow = { id: string; district_id: string; text: string; status: string; region_id: string | null; created_at: string; version: number; district: string; governorate: string; orders: number; last_order: string | null };

/**
 * The customer's own words for an area that is not in the list. The order is never blocked. If an existing region of the district already
 * has that name or alias, the order is linked to it; otherwise one row per district and spelling is kept for the team to approve or merge.
 */
export function recordUnlisted(districtId: string, typed: string): { ok: true; regionId: string | null; regionName: string; unlistedId: string } | { ok: false; error: string } {
  const text = cleanText(typed);
  if (text.length < 3) return { ok: false, error: "Type the name of your area (at least 3 letters)." };
  const d = sqlite().prepare("SELECT id FROM locations WHERE id = ? AND type = 'district' AND hidden = 0").get(districtId);
  if (!d) return { ok: false, error: "Choose your district." };
  const norm = foldAny(text);
  if (!norm) return { ok: false, error: "Type the name of your area using letters." };
  // the area may already exist under another spelling: use it
  const regions = sqlite().prepare("SELECT id, name_en, name_ar, aliases FROM locations WHERE parent_id = ? AND type = 'region' AND hidden = 0").all(districtId) as { id: string; name_en: string; name_ar: string; aliases: string }[];
  const known = regions.find((r) => [r.name_en, r.name_ar, ...aliasList(r.aliases)].some((n) => n && foldAny(n) === norm));
  if (known) return { ok: true, regionId: known.id, regionName: known.name_en, unlistedId: "" };
  const row = sqlite().prepare("SELECT id, status, region_id FROM unlisted_areas WHERE district_id = ? AND norm = ?").get(districtId, norm) as { id: string; status: string; region_id: string | null } | undefined;
  if (row) {
    if ((row.status === "approved" || row.status === "merged") && row.region_id) {
      const rg = sqlite().prepare("SELECT name_en FROM locations WHERE id = ? AND hidden = 0").get(row.region_id) as { name_en: string } | undefined;
      if (rg) return { ok: true, regionId: row.region_id, regionName: rg.name_en, unlistedId: row.id };
    }
    return { ok: true, regionId: null, regionName: text, unlistedId: row.id };
  }
  const id = `U${crypto.randomBytes(6).toString("hex")}`;
  sqlite().prepare("INSERT INTO unlisted_areas (id, district_id, text, norm) VALUES (?, ?, ?, ?)").run(id, districtId, text, norm);
  return { ok: true, regionId: null, regionName: text, unlistedId: id };
}

export function listUnlisted(status: "pending" | "done" = "pending", limit = 200): UnlistedRow[] {
  return sqlite()
    .prepare(
      `SELECT u.id, u.district_id, u.text, u.status, u.region_id, u.created_at, u.version, d.name_en AS district, g.name_en AS governorate,
              (SELECT COUNT(*) FROM orders o WHERE o.unlisted_area_id = u.id) AS orders,
              (SELECT MAX(o.created_at) FROM orders o WHERE o.unlisted_area_id = u.id) AS last_order
       FROM unlisted_areas u JOIN locations d ON d.id = u.district_id JOIN locations g ON g.id = d.parent_id
       WHERE ${status === "pending" ? "u.status = 'pending'" : "u.status <> 'pending'"}
       ORDER BY orders DESC, u.created_at DESC LIMIT ?`,
    )
    .all(limit) as UnlistedRow[];
}
export const unlistedCount = (): number => (sqlite().prepare("SELECT COUNT(*) AS n FROM unlisted_areas WHERE status = 'pending'").get() as { n: number }).n;

function pendingRow(id: string) {
  const u = sqlite().prepare("SELECT id, district_id, text, status FROM unlisted_areas WHERE id = ?").get(id) as { id: string; district_id: string; text: string; status: string } | undefined;
  if (!u) throw new Error("That area no longer exists.");
  if (u.status !== "pending") throw new Error(`This area was already ${u.status}.`);
  return u;
}
const linkOrders = (unlistedId: string, regionId: string) => sqlite().prepare("UPDATE orders SET region_id = ? WHERE unlisted_area_id = ? AND region_id = ''").run(regionId, unlistedId);

/** Approve what customers typed as a NEW region of its district. It appears at checkout for everyone straight away. */
export function approveUnlisted(id: string, nameEn?: string, nameAr?: string): string {
  return getEngine().tx(() => {
    const u = pendingRow(id);
    const en = clean(nameEn || u.text);
    const regionId = addRegion(u.district_id, en, nameAr ?? "", /[\u0600-\u06FF]/.test(u.text) || foldEnglish(u.text) === foldEnglish(en) ? [] : [u.text], "customer");
    sqlite().prepare("UPDATE unlisted_areas SET status = 'approved', region_id = ?, decided_at = ?, version = version + 1 WHERE id = ?").run(regionId, new Date().toISOString(), id);
    linkOrders(id, regionId);
    return regionId;
  });
}

/** Merge into an existing region of the SAME district: what the customers typed becomes one of its aliases. */
export function mergeUnlisted(id: string, regionId: string) {
  getEngine().tx(() => {
    const u = pendingRow(id);
    const r = sqlite().prepare("SELECT id, name_en, aliases FROM locations WHERE id = ? AND type = 'region' AND parent_id = ?").get(regionId, u.district_id) as { id: string; name_en: string; aliases: string } | undefined;
    if (!r) throw new Error("Choose a region of the same district.");
    const aliases = aliasList(r.aliases);
    if (foldAny(u.text) !== foldAny(r.name_en) && !aliases.some((a) => foldAny(a) === foldAny(u.text))) aliases.push(u.text);
    sqlite().prepare("UPDATE locations SET aliases = ?, version = version + 1, updated_at = ? WHERE id = ?").run(JSON.stringify(aliases.slice(0, 20)), new Date().toISOString(), regionId);
    sqlite().prepare("UPDATE unlisted_areas SET status = 'merged', region_id = ?, decided_at = ?, version = version + 1 WHERE id = ?").run(regionId, new Date().toISOString(), id);
    linkOrders(id, regionId);
  });
}

export function dismissUnlisted(id: string) {
  pendingRow(id);
  sqlite().prepare("UPDATE unlisted_areas SET status = 'dismissed', decided_at = ?, version = version + 1 WHERE id = ?").run(new Date().toISOString(), id);
}

/** The regions of a district for the "merge into" menu. */
export const regionChoices = (districtId: string) => (sqlite().prepare("SELECT id, name_en FROM locations WHERE parent_id = ? AND type = 'region' ORDER BY name_en").all(districtId) as { id: string; name_en: string }[]);
