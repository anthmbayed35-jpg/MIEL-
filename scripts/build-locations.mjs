// Builds the Lebanon location tables (migration 0010 + the validation report) from the official open data on HDX.
//
//   npm run locations            reads data-src/*.xlsx (downloads them from HDX first when missing)
//   npm run locations -- --check validates only, writes nothing
//
// Sources (nothing is taken from Google):
//  1. "Lebanon - Subnational Administrative Boundaries" (COD-AB, Council for Development and Reconstruction, CC BY-IGO):
//     the 8 governorates and 26 districts (cazas), with their official codes (P-codes) and Arabic names.
//     https://data.humdata.org/dataset/cod-ab-lbn   (file lbn_admin_boundaries.xlsx)
//  2. "Lebanon: Villages/Settlements" (Central Administration of Statistics, CC BY):
//     every locality (city, town, village, Beirut neighbourhood) with its district, official code and Arabic name.
//     https://data.humdata.org/dataset/lebanon-villages-settlements   (file LBN_villages-Localities_List_02052017.xlsx)
//
// The generated SQL is committed, so Railway never needs the network: the migration seeds the tables on first boot.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data-src");
const FILES = {
  admin: {
    file: path.join(SRC, "admin_boundaries.xlsx"),
    url: "https://data.humdata.org/dataset/569beba7-bad7-4951-a19d-468a035461cd/resource/83dae3aa-1047-4019-9ca2-a5709810ad21/download/lbn_admin_boundaries.xlsx",
  },
  localities: {
    file: path.join(SRC, "localities.xlsx"),
    url: "https://data.humdata.org/dataset/7aa772c3-63c1-4044-9337-28db1f82c011/resource/0368ab98-a975-4613-b070-4ec7b6fca119/download/lbn_villages-localities_list_02052017.xlsx",
  },
};
const CHECK_ONLY = process.argv.includes("--check");

async function ensure(f) {
  if (fs.existsSync(f.file)) return;
  fs.mkdirSync(SRC, { recursive: true });
  console.log(`downloading ${f.url}`);
  const res = await fetch(f.url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Could not download ${f.url} (HTTP ${res.status}). Download it by hand and save it as ${f.file}`);
  fs.writeFileSync(f.file, Buffer.from(await res.arrayBuffer()));
}
for (const f of Object.values(FILES)) await ensure(f);

const sheet = (file, name) => XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets[name], { defval: "" });
const admin1 = sheet(FILES.admin.file, "lbn_admin1");
const admin2 = sheet(FILES.admin.file, "lbn_admin2");
const locs = sheet(FILES.localities.file, "Locations");

// ---------------------------------------------------------------- cleaning
const ws = (s) => String(s ?? "").replace(/[​-‏‪-‮﻿]/g, "").replace(/\s+/g, " ").trim();
/** ALL-CAPS English names ("DEIR EL BALAMAND") become "Deir El Balamand"; mixed-case names are kept as written. */
function nice(en) {
  const s = ws(en);
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(.'’])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}
const fold = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- governorates and districts (COD-AB)
const govs = admin1.map((r) => ({ id: ws(r.adm1_pcode), name_en: ws(r.adm1_name), name_ar: ws(r.adm1_name1), code: ws(r.adm1_pcode), lat: Number(r.center_lat), lon: Number(r.center_lon) }));
const dists = admin2.map((r) => ({ id: ws(r.adm2_pcode), parent: ws(r.adm1_pcode), name_en: ws(r.adm2_name), name_ar: ws(r.adm2_name1), code: ws(r.adm2_pcode), lat: Number(r.center_lat), lon: Number(r.center_lon) }));
const errors = [];
if (govs.length !== 8) errors.push(`expected 8 governorates, found ${govs.length}`);
if (dists.length !== 26) errors.push(`expected 26 districts, found ${dists.length}`);
const govById = new Map(govs.map((g) => [g.id, g]));
for (const d of dists) if (!govById.has(d.parent)) errors.push(`district ${d.name_en} has an unknown governorate ${d.parent}`);
const govByName = new Map(govs.map((g) => [g.name_en, g]));
const distByName = new Map(dists.map((d) => [d.name_en, d]));

// ---------------------------------------------------------------- regions (CAS localities)
const seen = new Map(); // district id + folded name -> region (merge duplicates)
const merged = [];
const regions = [];
let cleaned = 0;
for (const r of locs) {
  const code = ws(r.Pcode);
  const rawEn = String(r.Location_Name_En);
  const en = nice(rawEn);
  const ar = ws(r["Location_Name_Arabic "] ?? r.Location_Name_Arabic);
  if (en !== rawEn) cleaned++;
  const dist = distByName.get(ws(r.District));
  if (!dist) { errors.push(`${code} ${en}: unknown district "${r.District}"`); continue; }
  const gov = govByName.get(ws(r.Governorate));
  if (!gov) { errors.push(`${code} ${en}: unknown governorate "${r.Governorate}"`); continue; }
  if (gov.id !== dist.parent) { errors.push(`${code} ${en}: district ${dist.name_en} belongs to ${govById.get(dist.parent).name_en}, not ${gov.name_en}`); continue; }
  if (!en) { errors.push(`${code}: empty English name`); continue; }
  const key = `${dist.id}|${fold(en)}`;
  const prior = seen.get(key);
  if (prior) { // the same place listed twice in one district: keep the first, remember the merge
    merged.push(`${code} "${en}" merged into ${prior.code}`);
    if (!prior.name_ar && ar) prior.name_ar = ar;
    continue;
  }
  const lat = Number(r.Latitude), lon = Number(r.Longitude);
  const region = { id: code, parent: dist.id, name_en: en, name_ar: ar, code, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null };
  seen.set(key, region);
  regions.push(region);
}
const codes = new Set();
for (const x of [...govs, ...dists, ...regions]) {
  if (codes.has(x.id)) errors.push(`duplicate code ${x.id}`);
  codes.add(x.id);
}
const emptyAr = regions.filter((r) => !r.name_ar);

// ---------------------------------------------------------------- report
const perDistrict = dists.map((d) => ({ d, n: regions.filter((r) => r.parent === d.id).length }));
const perGov = govs.map((g) => ({ g, d: dists.filter((d) => d.parent === g.id).length, n: perDistrict.filter((x) => x.d.parent === g.id).reduce((a, x) => a + x.n, 0) }));
const orphans = regions.filter((r) => !dists.some((d) => d.id === r.parent)).length + dists.filter((d) => !govById.has(d.parent)).length;
const report = [
  "# Lebanon locations: validation report",
  "",
  "Generated by `npm run locations` (scripts/build-locations.mjs) from the official open data on HDX. Nothing comes from Google.",
  "",
  "## Sources",
  "",
  "- **Governorates and districts:** HDX \"Lebanon - Subnational Administrative Boundaries\" (COD-AB; Council for Development and Reconstruction, CC BY-IGO), file `lbn_admin_boundaries.xlsx`, sheets `lbn_admin1` and `lbn_admin2` (version v02). https://data.humdata.org/dataset/cod-ab-lbn",
  "- **Regions (cities, towns, villages, Beirut neighbourhoods):** HDX \"Lebanon: Villages/Settlements\" (Central Administration of Statistics, CC BY), file `LBN_villages-Localities_List_02052017.xlsx`, sheet `Locations`. https://data.humdata.org/dataset/lebanon-villages-settlements",
  "",
  "## Counts",
  "",
  `- Governorates: **${govs.length}** (expected 8)`,
  `- Districts (cazas): **${dists.length}** (expected 26)`,
  `- Regions: **${regions.length}** (source rows: ${locs.length}; merged duplicates: ${merged.length})`,
  `- Orphans (a region without a district, or a district without a governorate): **${orphans}**`,
  `- Regions without an Arabic name: **${emptyAr.length}**`,
  `- English names tidied (spaces trimmed or ALL CAPS fixed): ${cleaned}`,
  `- Validation errors: **${errors.length}**`,
  "",
  "## Per governorate",
  "",
  "| Governorate | Arabic | Code | Districts | Regions |",
  "|---|---|---|---|---|",
  ...perGov.map((x) => `| ${x.g.name_en} | ${x.g.name_ar} | ${x.g.code} | ${x.d} | ${x.n} |`),
  `| **Total** | | | **${dists.length}** | **${regions.length}** |`,
  "",
  "## Per district",
  "",
  "| Governorate | District | Arabic | Code | Regions |",
  "|---|---|---|---|---|",
  ...perDistrict.map((x) => `| ${govById.get(x.d.parent).name_en} | ${x.d.name_en} | ${x.d.name_ar} | ${x.d.code} | ${x.n} |`),
  "",
  ...(merged.length ? ["## Merged duplicates", "", ...merged.map((m) => `- ${m}`), ""] : []),
  ...(errors.length ? ["## Errors", "", ...errors.map((e) => `- ${e}`), ""] : []),
].join("\n");

console.log(report.split("\n").filter((l) => /^- (Gov|Dist|Reg|Orph|Valid|English)/.test(l)).join("\n"));
if (errors.length) {
  console.error(errors.slice(0, 20).join("\n"));
  process.exit(1);
}
if (CHECK_ONLY) process.exit(0);

// ---------------------------------------------------------------- the migration
const row = (x, type) =>
  `(${sql(x.id)}, ${x.parent ? sql(x.parent) : "NULL"}, ${sql(type)}, ${sql(x.code)}, ${sql(x.name_en)}, ${sql(x.name_ar)}, ${sql(x.name_en)}, ${Number.isFinite(x.lat) && x.lat !== null ? x.lat.toFixed(6) : "NULL"}, ${Number.isFinite(x.lon) && x.lon !== null ? x.lon.toFixed(6) : "NULL"})`;
const insert = (list, type) => {
  const out = [];
  for (let i = 0; i < list.length; i += 200) {
    out.push(`INSERT INTO locations (id, parent_id, type, code, name_en, name_ar, official_name_en, lat, lon) VALUES\n${list.slice(i, i + 200).map((x) => row(x, type)).join(",\n")};`);
  }
  return out.join("\n");
};
const migration = `-- Lebanon locations: 8 governorates, 26 districts (cazas) and every region (city, town, village, Beirut neighbourhood).
-- GENERATED by scripts/build-locations.mjs from the official open data on HDX (see docs/LOCATIONS-REPORT.md). Do not edit by hand:
-- change the data in Admin > Settings > Locations, or re-run \`npm run locations\`.
-- Orders are NOT touched. They keep the location names they were placed with and gain empty id columns for future orders.

CREATE TABLE locations (
  id TEXT PRIMARY KEY,                                  -- the official code for official places, a random id for regions the team adds
  parent_id TEXT REFERENCES locations(id),              -- governorate -> NULL, district -> its governorate, region -> its district
  type TEXT NOT NULL CHECK (type IN ('governorate','district','region')),
  code TEXT NOT NULL DEFAULT '',                        -- official code (P-code); empty for a region added by the team
  name_en TEXT NOT NULL,                                -- shown to customers; the team may rename it
  name_ar TEXT NOT NULL DEFAULT '',
  official_name_en TEXT NOT NULL DEFAULT '',            -- the name in the official data, never edited
  hidden INTEGER NOT NULL DEFAULT 0,                    -- 1 = not offered at checkout (a place we do not deliver to)
  custom INTEGER NOT NULL DEFAULT 0,                    -- 1 = added by the team
  lat REAL,
  lon REAL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX locations_parent ON locations(parent_id, type, hidden);
CREATE INDEX locations_type ON locations(type);

-- Orders: the location ids, the region (town or village) name, and the optional map pin (all empty for existing orders).
ALTER TABLE orders ADD COLUMN governorate_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN district_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN region_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN region_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN pin_lat REAL;
ALTER TABLE orders ADD COLUMN pin_lon REAL;
ALTER TABLE orders ADD COLUMN pin_link TEXT NOT NULL DEFAULT '';
CREATE INDEX orders_district ON orders(district_id);
CREATE INDEX orders_governorate ON orders(governorate_id);

${insert(govs, "governorate")}
${insert(dists, "district")}
${insert(regions, "region")}
`;
fs.writeFileSync(path.join(ROOT, "migrations", "0010_locations.sql"), migration);
fs.writeFileSync(path.join(ROOT, "docs", "LOCATIONS-REPORT.md"), report + "\n");
console.log(`wrote migrations/0010_locations.sql (${(migration.length / 1024).toFixed(0)} KB) and docs/LOCATIONS-REPORT.md`);
