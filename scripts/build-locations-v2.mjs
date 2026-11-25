// Builds the COMPLETE Lebanon region list (migration 0011 + the v2 validation report) by combining four sources:
//   1. CAS settlements list (the 2,708 official regions already seeded by migration 0010)     https://data.humdata.org/dataset/lebanon-villages-settlements
//   2. HDX COD-AB boundaries (districts as polygons, used for point-in-polygon)               https://data.humdata.org/dataset/cod-ab-lbn
//   3. OpenStreetMap places via the Overpass API (city, town, village, hamlet, suburb, neighbourhood, quarter, with every name tag)
//   4. GeoNames Lebanon dump (populated places and their alternate names, Arabic included)    https://download.geonames.org/export/dump/LB.zip
// plus a short hand-made list of well-known neighbourhoods (scripts/data/manual-places.mjs).
//
//   npm run locations:v2              reads data-src/ (downloads what is missing, including a fresh Overpass query)
//   npm run locations:v2 -- --check   validates only, writes nothing
//
// Every place is assigned to its district by point-in-polygon against the official boundaries. Duplicates (same place, other spelling or
// source) merge into ONE region that keeps all names as aliases and the OFFICIAL name as the display name. Low-confidence cases are listed
// in the report. The generated SQL is committed: Railway never calls any of these services.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import XLSX from "xlsx";
import { editDistance, foldArabic, foldEnglish, skeleton } from "../lib/search-text.ts";
import { CHECKLIST, MANUAL } from "./data/manual-places.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data-src");
const CHECK_ONLY = process.argv.includes("--check");
const UA = "MielLocationBuilder/2.0 (one-off build of the Miel+ place list)";
const f = (n) => path.join(SRC, n);

// ---------------------------------------------------------------- downloads
async function download(url, file, init) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return;
  fs.mkdirSync(SRC, { recursive: true });
  console.log(`downloading ${url.slice(0, 90)}`);
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, ...init });
  if (!res.ok) throw new Error(`Could not download ${url} (HTTP ${res.status}). Download it by hand and save it as ${file}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
await download("https://data.humdata.org/dataset/569beba7-bad7-4951-a19d-468a035461cd/resource/83dae3aa-1047-4019-9ca2-a5709810ad21/download/lbn_admin_boundaries.xlsx", f("admin_boundaries.xlsx"));
await download("https://data.humdata.org/dataset/7aa772c3-63c1-4044-9337-28db1f82c011/resource/0368ab98-a975-4613-b070-4ec7b6fca119/download/lbn_villages-localities_list_02052017.xlsx", f("localities.xlsx"));
await download("https://data.humdata.org/dataset/569beba7-bad7-4951-a19d-468a035461cd/resource/81ca0135-b5c9-46e0-a546-f0bdd6d7fd42/download/lbn_admin_boundaries.geojson.zip", f("admin_geojson.zip"));
await download("https://download.geonames.org/export/dump/LB.zip", f("LB.zip"));
const OVERPASS = '[out:json][timeout:240];area["ISO3166-1"="LB"][admin_level=2]->.a;(node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);way["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a);relation["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"](area.a););out center tags;';
for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
  if (fs.existsSync(f("osm.json")) && fs.statSync(f("osm.json")).size > 100000) break;
  try {
    await download(url, f("osm.json"), { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(OVERPASS) });
  } catch (e) {
    console.log("overpass mirror failed:", e.message.slice(0, 80));
  }
}
if (!fs.existsSync(f("osm.json"))) throw new Error("No OpenStreetMap data. Run the query in this script on any Overpass server and save the JSON as data-src/osm.json");

// ---------------------------------------------------------------- helpers
const ws = (s) => String(s ?? "").replace(/[​-‏‪-‮﻿]/g, "").replace(/\s+/g, " ").trim();
const isArabic = (s) => /[؀-ۿ]/.test(s);
const isLatin = (s) => /[A-Za-zÀ-ɏ]/.test(s) && !isArabic(s);
const nice = (en) => {
  const s = ws(en);
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(.'’])([a-z])/g, (_, a, b) => a + b.toUpperCase());
};
const km = (a, b) => {
  if (a.lat == null || b.lat == null) return 0;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (a.lat - b.lat) * 110.57;
  return Math.hypot(dx, dy);
};
const cleanName = (s) => {
  const t = ws(s).replace(/^["'“”]+|["'“”]+$/g, "");
  return t.length >= 2 && t.length <= 60 && /[\p{L}]/u.test(t) ? t : "";
};

// ---------------------------------------------------------------- districts: polygons for point-in-polygon
const sheet = (file, name) => XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets[name], { defval: "" });
const admin1 = sheet(f("admin_boundaries.xlsx"), "lbn_admin1");
const admin2 = sheet(f("admin_boundaries.xlsx"), "lbn_admin2");
const govs = admin1.map((r) => ({ id: ws(r.adm1_pcode), en: ws(r.adm1_name) }));
const dists = admin2.map((r) => ({ id: ws(r.adm2_pcode), gov: ws(r.adm1_pcode), en: ws(r.adm2_name), ar: ws(r.adm2_name1), lat: Number(r.center_lat), lon: Number(r.center_lon) }));
const distById = new Map(dists.map((d) => [d.id, d]));
const distByName = new Map(dists.map((d) => [d.en, d]));
const govById = new Map(govs.map((g) => [g.id, g]));
const geo = JSON.parse(strFromU8(unzipSync(new Uint8Array(fs.readFileSync(f("admin_geojson.zip"))))["lbn_admin2_em.geojson"]));
const polys = geo.features.map((ft) => {
  const parts = ft.geometry.type === "Polygon" ? [ft.geometry.coordinates] : ft.geometry.coordinates;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of parts) for (const [x, y] of p[0]) { bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y); bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y); }
  return { id: ft.properties.adm2_pcode, parts, bbox };
});
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x, y, p) {
  if (x < p.bbox[0] || x > p.bbox[2] || y < p.bbox[1] || y > p.bbox[3]) return false;
  return p.parts.some((part) => inRing(x, y, part[0]) && !part.slice(1).some((hole) => inRing(x, y, hole)));
}
/** The district containing the point; null when it is outside every polygon (sea, or beyond the border). */
const districtAt = (lat, lon) => polys.find((p) => inPoly(lon, lat, p))?.id ?? null;
/** Nearest district centre within `maxKm` (for points that fall just off the coast polygon). */
function nearestDistrict(lat, lon, maxKm) {
  let best = null;
  for (const d of dists) {
    const k = km({ lat, lon }, d);
    if (!best || k < best.k) best = { id: d.id, k };
  }
  return best && best.k <= maxKm ? best.id : null;
}
/** Is the point within ~350 m of another district (or of the sea)? Probe 8 directions. */
function nearBoundary(lat, lon, id) {
  const d = 0.0032; // ~350 m
  for (let a = 0; a < 8; a++) {
    const la = lat + d * Math.sin((a * Math.PI) / 4);
    const lo = lon + (d * Math.cos((a * Math.PI) / 4)) / Math.cos((lat * Math.PI) / 180);
    const at = districtAt(la, lo);
    if (at && at !== id) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 1. official regions (CAS list, already in migration 0010)
const entries = []; // every region: official first, then additions
const byDistrict = new Map(dists.map((d) => [d.id, []]));
const lowConf = [];
const log = { merges: [], fuzzy: [], noEnglish: [], outside: [], officialOnly: [], renamedDup: [], newBySource: {}, mergedBySource: {} };
const TYPE_W = { city: 5, town: 4, suburb: 3, neighbourhood: 3, quarter: 3, village: 2, hamlet: 1 };

function makeKeys(e) {
  e.keys = new Set();
  e.ar = new Set();
  e.skel = new Set();
  for (const n of [e.en, ...e.names]) {
    if (isArabic(n)) {
      const a = foldArabic(n);
      if (a.length >= 3) e.ar.add(a);
    } else {
      const k = foldEnglish(n);
      if (k) {
        e.keys.add(k);
        const s = skeleton(n);
        if (s.length >= 3) e.skel.add(s);
      }
    }
  }
  const a = foldArabic(e.nameAr);
  if (a.length >= 3) e.ar.add(a);
}
function add(e) {
  e.names ??= new Set();
  makeKeys(e);
  entries.push(e);
  byDistrict.get(e.d).push(e);
  return e;
}
for (const r of sheet(f("localities.xlsx"), "Locations")) {
  const d = distByName.get(ws(r.District));
  const en = nice(r.Location_Name_En);
  const lat = Number(r.Latitude);
  const lon = Number(r.Longitude);
  const e = add({ id: ws(r.Pcode), d: d.id, en, nameAr: ws(r["Location_Name_Arabic "] ?? r.Location_Name_Arabic), names: new Set(), lat, lon, w: d.id === "LB11" ? 3 : 2, src: new Set(["cas"]), official: true, isNew: false, changed: false, declared: d.id });
  const at = districtAt(lat, lon);
  if (at && at !== d.id) lowConf.push({ id: e.id, name: en, district: d.en, why: `official district ${d.en}, but the coordinates fall in ${distById.get(at).en}` });
}
const officialCount = entries.length;

// ---------------------------------------------------------------- matching and merging
function findMatch(cand) {
  const pool = byDistrict.get(cand.d);
  let best = null;
  for (const e of pool) {
    const dist = km(e, cand);
    let kind = null;
    for (const a of cand.ar) if (e.ar.has(a) && dist < 12) kind = "arabic name";
    if (!kind) for (const k of cand.keys) if (e.keys.has(k) && dist < 12) kind = "same name";
    if (!kind) for (const s of cand.skel) if (e.skel.has(s) && dist < 3) kind = "spelling variant";
    if (!kind && dist < 0.3) {
      for (const a of cand.keys) for (const b of e.keys) if (a.length >= 4 && b.length >= 4 && (editDistance(a, b, 2) <= 2 || a.startsWith(b) || b.startsWith(a))) kind = "next to a similar name";
    }
    if (kind && (!best || dist < best.dist)) best = { e, dist, kind };
  }
  return best;
}
function mergeInto(e, cand, srcName) {
  const before = e.names.size + e.src.size + (e.w ?? 0);
  e.src.add(srcName);
  e.w = Math.max(e.w ?? 2, cand.w ?? 2);
  for (const n of cand.allNames) if (foldEnglish(n) !== foldEnglish(e.en) || isArabic(n)) e.names.add(n);
  if (!e.nameAr && cand.nameAr) e.nameAr = cand.nameAr;
  if (e.lat == null || Number.isNaN(e.lat)) {
    e.lat = cand.lat;
    e.lon = cand.lon;
  }
  makeKeys(e);
  if (e.names.size + e.src.size + e.w !== before) e.changed = true;
}

// ---------------------------------------------------------------- 3. OpenStreetMap
const osm = JSON.parse(fs.readFileSync(f("osm.json"), "utf8")).elements;
function osmCandidate(el) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const raw = [t["name:en"], t.int_name, t["name:fr"], t.name, t.alt_name, t["alt_name:en"], t["alt_name:fr"], t.old_name, t["old_name:en"], t.loc_name, t["official_name:en"], t["name:ar"], t["alt_name:ar"], t["old_name:ar"], t["loc_name:ar"], t["short_name"], t["name:ar-Latn"]]
    .filter(Boolean)
    .flatMap((x) => String(x).split(/;|\//));
  const all = [...new Set(raw.map(cleanName).filter(Boolean))];
  const latin = all.filter(isLatin);
  const arabic = all.filter(isArabic);
  const display = cleanName(t["name:en"]) || cleanName(t.int_name) || (isLatin(t.name ?? "") ? cleanName(t.name) : "") || latin[0] || "";
  return { src: "osm", sid: `OSM${el.type[0]}${el.id}`, lat, lon, display: display ? nice(display) : "", nameAr: cleanName(t["name:ar"]) || (isArabic(t.name ?? "") ? cleanName(t.name) : "") || arabic[0] || "", allNames: all, w: TYPE_W[t.place] ?? 2, place: t.place };
}
// ---------------------------------------------------------------- 4. GeoNames
const gnRows = strFromU8(unzipSync(new Uint8Array(fs.readFileSync(f("LB.zip"))))["LB.txt"]).split("\n").filter(Boolean).map((l) => l.split("\t"));
const GN_OK = new Set(["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLL", "PPLS", "PPLX", "PPLG"]);
function gnCandidate(r) {
  const [id, name, ascii, alt, lat, lon, cls, code, , , , , , , pop] = r;
  if (cls !== "P" || !GN_OK.has(code)) return null;
  const all = [...new Set([name, ascii, ...String(alt).split(",")].map(cleanName).filter(Boolean))];
  const latin = all.filter(isLatin);
  const arabic = all.filter(isArabic);
  const population = Number(pop) || 0;
  const w = Math.max(code === "PPLC" ? 5 : code.startsWith("PPLA") ? 4 : code === "PPLX" ? 3 : 2, population > 50000 ? 5 : population > 10000 ? 4 : population > 2000 ? 3 : 2);
  return { src: "geonames", sid: `GN${id}`, lat: Number(lat), lon: Number(lon), display: nice(cleanName(ascii) || cleanName(name) || latin[0] || ""), nameAr: arabic[0] ?? "", allNames: all, w };
}

const stats = { osm: { seen: 0, matched: 0, added: 0, outside: 0 }, geonames: { seen: 0, matched: 0, added: 0, outside: 0 }, manual: { seen: 0, matched: 0, added: 0, outside: 0 } };
function ingest(cand) {
  const s = stats[cand.src];
  s.seen++;
  let d = districtAt(cand.lat, cand.lon);
  if (!d) d = nearestDistrict(cand.lat, cand.lon, 2.5); // a point just off the coast polygon
  if (!d) {
    s.outside++;
    log.outside.push(`${cand.display || cand.allNames[0]} (${cand.src} ${cand.sid}, ${cand.lat.toFixed(4)}, ${cand.lon.toFixed(4)})`);
    return;
  }
  cand.d = d;
  cand.keys = new Set();
  cand.ar = new Set();
  cand.skel = new Set();
  for (const n of cand.allNames) {
    if (isArabic(n)) {
      const a = foldArabic(n);
      if (a.length >= 3) cand.ar.add(a);
    } else {
      const k = foldEnglish(n);
      if (k) {
        cand.keys.add(k);
        const sk = skeleton(n);
        if (sk.length >= 3) cand.skel.add(sk);
      }
    }
  }
  const m = findMatch(cand);
  if (m) {
    s.matched++;
    const wasNames = m.e.names.size;
    mergeInto(m.e, cand, cand.src);
    log.mergedBySource[cand.src] = (log.mergedBySource[cand.src] ?? 0) + 1;
    if (m.kind === "spelling variant" || m.kind === "next to a similar name") log.fuzzy.push({ kept: m.e.en, merged: cand.display || cand.allNames[0], district: distById.get(d).en, why: `${m.kind}, ${m.dist.toFixed(1)} km apart (${cand.src})` });
    if (m.e.names.size > wasNames) log.merges.push({ region: m.e.en, district: distById.get(d).en, added: [...m.e.names].slice(wasNames).join(" | "), src: cand.src });
    return;
  }
  // a new region: needs a display name
  let en = cand.display;
  if (!en) {
    en = cand.nameAr;
    if (!en) return;
    log.noEnglish.push(`${en} (${cand.src} ${cand.sid}, ${distById.get(d).en})`);
  }
  const pool = byDistrict.get(d);
  if (pool.some((e) => foldEnglish(e.en) === foldEnglish(en))) {
    // a different place with the same name in the same district: keep both, tell them apart by their nearest neighbour
    const near = pool.filter((e) => e.lat != null && foldEnglish(e.en) !== foldEnglish(en)).sort((a, b) => km(a, cand) - km(b, cand))[0];
    const qualified = near ? `${en} (near ${near.en})` : `${en} (${cand.sid})`;
    log.renamedDup.push(`${en} -> ${qualified} (${distById.get(d).en})`);
    en = qualified;
  }
  const e = add({ id: cand.sid, d, en, nameAr: cand.nameAr, names: new Set(cand.allNames.filter((n) => foldEnglish(n) !== foldEnglish(en) || isArabic(n))), lat: cand.lat, lon: cand.lon, w: cand.w, src: new Set([cand.src]), official: false, isNew: true, changed: true });
  s.added++;
  log.newBySource[cand.src] = (log.newBySource[cand.src] ?? 0) + 1;
  const at = districtAt(cand.lat, cand.lon);
  if (!at) lowConf.push({ id: e.id, name: en, district: distById.get(d).en, why: `${cand.src} point is off the boundary polygons; placed in the nearest district` });
  else if (nearBoundary(cand.lat, cand.lon, d)) lowConf.push({ id: e.id, name: en, district: distById.get(d).en, why: `${cand.src} point is within ~350 m of another district` });
}
osm.map(osmCandidate).filter(Boolean).sort((a, b) => b.w - a.w).forEach(ingest);
gnRows.map(gnCandidate).filter(Boolean).sort((a, b) => b.w - a.w).forEach(ingest);

// ---------------------------------------------------------------- 5. hand-made well-known places (and common alternative spellings)
for (const m of MANUAL) {
  const at = districtAt(m.lat, m.lon);
  if (at && at !== m.d) lowConf.push({ id: `MAN-${m.en}`, name: m.en, district: distById.get(m.d).en, why: `declared in ${distById.get(m.d).en}, but the approximate coordinates fall in ${distById.get(at).en} (declared district kept)` });
  stats.manual.seen++;
  const cand = { src: "manual", sid: `MAN-${foldEnglish(m.en).replace(/ /g, "-")}`, lat: m.lat, lon: m.lon, display: m.en, nameAr: m.ar, allNames: [m.en, m.ar, ...m.alias], w: m.w, d: m.d, keys: new Set(), ar: new Set(), skel: new Set() };
  for (const n of cand.allNames) {
    if (isArabic(n)) cand.ar.add(foldArabic(n));
    else {
      cand.keys.add(foldEnglish(n));
      const sk = skeleton(n);
      if (sk.length >= 3) cand.skel.add(sk);
    }
  }
  // match by names only (the approximate coordinates are not trusted for distance)
  const pool = byDistrict.get(m.d);
  const hit = pool.find((e) => [...cand.ar].some((a) => e.ar.has(a)) || [...cand.keys].some((k) => e.keys.has(k))) ?? pool.find((e) => [...cand.skel].some((s) => e.skel.has(s)) && km(e, cand) < 6);
  if (hit) {
    stats.manual.matched++;
    const wasNames = hit.names.size;
    mergeInto(hit, { ...cand, lat: hit.lat, lon: hit.lon }, "manual");
    if (hit.names.size > wasNames) log.merges.push({ region: hit.en, district: distById.get(m.d).en, added: [...hit.names].slice(wasNames).join(" | "), src: "manual" });
  } else {
    stats.manual.added++;
    log.newBySource.manual = (log.newBySource.manual ?? 0) + 1;
    add({ id: cand.sid, d: m.d, en: m.en, nameAr: m.ar, names: new Set(m.alias), lat: m.lat, lon: m.lon, w: m.w, src: new Set(["manual"]), official: false, isNew: true, changed: true });
  }
}

// ---------------------------------------------------------------- finishing: aliases, weights, source labels
const SRC_LABEL = (e) => ["cas", "osm", "geonames", "manual"].filter((s) => e.src.has(s)).join("+");
for (const e of entries) {
  // keep the aliases that add something: the search already treats spelling variants of one name as the same word (skeleton matching), so an
  // English alias is kept only when its skeleton differs from the name and from the aliases kept before; Arabic ones when their folded form is new.
  const seenSk = new Set([skeleton(e.en)]);
  const seenAr = new Set([foldArabic(e.nameAr)]);
  const seenEn = new Set([foldEnglish(e.en)]);
  const latin = [];
  const arabic = [];
  for (const n of [...e.names].sort((x, y) => x.length - y.length)) {
    if (isArabic(n)) {
      const k = foldArabic(n);
      if (k && !seenAr.has(k) && arabic.length < 4) {
        seenAr.add(k);
        arabic.push(n);
      }
    } else {
      const k = foldEnglish(n);
      const sk = skeleton(n);
      if (!k || seenEn.has(k) || (sk && seenSk.has(sk)) || latin.length >= 6) continue;
      seenEn.add(k);
      if (sk) seenSk.add(sk);
      latin.push(n);
    }
  }
  const out = [...latin, ...arabic];
  e.aliases = out;
  if (e.official && e.aliases.length === 0 && e.src.size === 1 && e.w === (e.d === "LB11" ? 3 : 2)) e.changed = false;
}
const unmatchedOfficial = entries.filter((e) => e.official && e.src.size === 1);

// ---------------------------------------------------------------- presence checklist
const find = (name) => {
  const k = foldEnglish(name);
  const sk = skeleton(name);
  return entries.find((e) => e.keys.has(k)) ?? entries.find((e) => e.skel.has(sk) && sk.length >= 3) ?? dists.find((d) => foldEnglish(d.en) === k);
};
const missing = CHECKLIST.filter((n) => !find(n));

// ---------------------------------------------------------------- validation
const errors = [];
for (const e of entries) if (!distById.has(e.d)) errors.push(`${e.id}: unknown district`);
const ids = new Set();
for (const e of entries) {
  if (ids.has(e.id)) errors.push(`duplicate id ${e.id}`);
  ids.add(e.id);
}
const seenName = new Set();
for (const e of entries) {
  const k = `${e.d}|${e.en.toLowerCase()}`;
  if (seenName.has(k)) errors.push(`duplicate display name in a district: ${e.en} (${e.d})`);
  seenName.add(k);
}
if (missing.length) errors.push(`checklist places still missing: ${missing.join(", ")}`);

// ---------------------------------------------------------------- report
const perDist = dists.map((d) => {
  const list = entries.filter((e) => e.d === d.id);
  return { d, total: list.length, cas: list.filter((e) => e.src.has("cas")).length, osm: list.filter((e) => e.src.has("osm")).length, gn: list.filter((e) => e.src.has("geonames")).length, manual: list.filter((e) => e.src.has("manual")).length, added: list.filter((e) => e.isNew).length };
});
const perGov = govs.map((g) => ({ g, rows: perDist.filter((x) => x.d.gov === g.id) }));
const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
const newOnes = entries.filter((e) => e.isNew);
const report = [
  "# Lebanon locations v2: validation report",
  "",
  "Generated by `npm run locations:v2` (scripts/build-locations-v2.mjs). Sources: CAS settlements list and HDX COD-AB boundaries (the official data of v1), **OpenStreetMap** (Overpass API, snapshot " + new Date().toISOString().slice(0, 10) + "), **GeoNames** (LB dump), and a short hand-made list of well-known neighbourhoods. Every place is assigned to its district by point-in-polygon against the official COD-AB district boundaries.",
  "",
  "## Totals",
  "",
  `- Official regions (CAS, v1): **${officialCount}**`,
  `- Regions after v2: **${entries.length}** (+${entries.length - officialCount})`,
  `- Source rows read: OSM ${stats.osm.seen}, GeoNames ${stats.geonames.seen} (populated places only), manual ${stats.manual.seen}`,
  `- Merged into an existing region (alias added): OSM ${stats.osm.matched}, GeoNames ${stats.geonames.matched}, manual ${stats.manual.matched}`,
  `- Added as new regions: OSM ${stats.osm.added}, GeoNames ${stats.geonames.added}, manual ${stats.manual.added}`,
  `- Outside Lebanon's district polygons (skipped): OSM ${stats.osm.outside}, GeoNames ${stats.geonames.outside}`,
  `- Regions that gained aliases: ${entries.filter((e) => e.aliases.length).length}; total aliases: ${entries.reduce((n, e) => n + e.aliases.length, 0)}`,
  `- Official regions found in no other source: **${unmatchedOfficial.length}** (kept; list in \`docs/locations-v2/official_not_found_elsewhere.csv\`)`,
  `- Fuzzy merges (spelling variants, to review): **${log.fuzzy.length}** (\`docs/locations-v2/fuzzy_merges.csv\`)`,
  `- Low-confidence assignments: **${lowConf.length}** (\`docs/locations-v2/low_confidence.csv\`)`,
  `- Same-name places told apart: ${log.renamedDup.length}; new places with no English name (Arabic shown): ${log.noEnglish.length}`,
  `- Validation errors: **${errors.length}**`,
  "",
  "## Checklist presence (50 well-known places)",
  "",
  missing.length === 0 ? "All 50 are present (as a region, an alias, or a district)." : `**Missing: ${missing.join(", ")}**`,
  "",
  "| Place | Found as | District |",
  "|---|---|---|",
  ...CHECKLIST.map((n) => {
    const e = find(n);
    return e ? `| ${n} | ${e.en ?? e.en} | ${distById.get(e.d ?? e.id)?.en ?? ""} |` : `| ${n} | MISSING | |`;
  }),
  "",
  "## Per governorate",
  "",
  "| Governorate | Districts | Regions | CAS | OSM | GeoNames | Manual | New in v2 |",
  "|---|---|---|---|---|---|---|---|",
  ...perGov.map((x) => `| ${x.g.en} | ${x.rows.length} | ${sum(x.rows, "total")} | ${sum(x.rows, "cas")} | ${sum(x.rows, "osm")} | ${sum(x.rows, "gn")} | ${sum(x.rows, "manual")} | ${sum(x.rows, "added")} |`),
  `| **Total** | ${dists.length} | **${entries.length}** | ${sum(perDist, "cas")} | ${sum(perDist, "osm")} | ${sum(perDist, "gn")} | ${sum(perDist, "manual")} | ${sum(perDist, "added")} |`,
  "",
  "(\"CAS / OSM / GeoNames / Manual\" count regions that include that source, so a region confirmed by several sources is counted in each.)",
  "",
  "## Per district",
  "",
  "| Governorate | District | Regions | CAS | OSM | GeoNames | Manual | New in v2 |",
  "|---|---|---|---|---|---|---|---|",
  ...perDist.map((x) => `| ${govById.get(x.d.gov).en} | ${x.d.en} | ${x.total} | ${x.cas} | ${x.osm} | ${x.gn} | ${x.manual} | ${x.added} |`),
  "",
  "## Where to look (full lists)",
  "",
  "- `docs/locations-v2/new_places.csv`: places found in OpenStreetMap / GeoNames / by hand that are NOT in the official list (added as new regions).",
  "- `docs/locations-v2/official_not_found_elsewhere.csv`: official regions that neither OSM nor GeoNames confirm.",
  "- `docs/locations-v2/merges.csv`: duplicates merged into one region, with the names kept as aliases.",
  "- `docs/locations-v2/fuzzy_merges.csv`: merges decided on a spelling variant or on proximity only (review these first).",
  "- `docs/locations-v2/low_confidence.csv`: places near a district boundary or whose sources disagree about the district.",
  ...(errors.length ? ["", "## Errors", "", ...errors.map((e) => `- ${e}`)] : []),
  "",
  "## Credits",
  "",
  "Map data © OpenStreetMap contributors (ODbL, https://www.openstreetmap.org/copyright). GeoNames (CC BY 4.0, https://www.geonames.org). HDX COD-AB boundaries by the Council for Development and Reconstruction (CC BY-IGO) and the Central Administration of Statistics settlements list (CC BY).",
].join("\n");

console.log(report.split("\n").filter((l) => /^- (Official|Regions|Source|Merged|Added|Outside|Low|Fuzzy|Validation)/.test(l)).join("\n"));
console.log(missing.length ? "MISSING: " + missing.join(", ") : "checklist: all 50 present");
if (errors.length) {
  console.error(errors.slice(0, 20).join("\n"));
  process.exit(1);
}
if (CHECK_ONLY) process.exit(0);

// ---------------------------------------------------------------- write the migration and the report files
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];
lines.push(`-- Lebanon locations v2: aliases, weights and sources for the official regions, plus ${newOnes.length} more regions (neighbourhoods, suburbs, towns and villages
-- the official list misses) from OpenStreetMap, GeoNames and a short hand-made list. GENERATED by scripts/build-locations-v2.mjs (see docs/LOCATIONS-V2-REPORT.md).
-- Map data © OpenStreetMap contributors (ODbL), GeoNames (CC BY 4.0). Orders are NOT touched: existing orders only gain one empty column.

ALTER TABLE locations ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]';   -- JSON array: other spellings, Arabic and French-style names, that also find this region
ALTER TABLE locations ADD COLUMN weight INTEGER NOT NULL DEFAULT 2;    -- 5 city, 4 town, 3 suburb or neighbourhood, 2 village, 1 hamlet: bigger places rank first in search
ALTER TABLE locations ADD COLUMN source TEXT NOT NULL DEFAULT 'cas';   -- cas, osm, geonames, manual (joined with +), or customer (approved from an unlisted area)

-- Areas customers typed because theirs was not in the list. The order is never blocked; the team approves each one as a new region or merges it into an existing one.
CREATE TABLE unlisted_areas (
  id TEXT PRIMARY KEY,
  district_id TEXT NOT NULL REFERENCES locations(id),
  text TEXT NOT NULL,                                   -- what the customer typed (first spelling seen)
  norm TEXT NOT NULL,                                   -- folded text, one row per district + norm
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','merged','dismissed')),
  region_id TEXT REFERENCES locations(id),              -- set when approved or merged
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  UNIQUE (district_id, norm)
);
CREATE INDEX unlisted_status ON unlisted_areas(status);
ALTER TABLE orders ADD COLUMN unlisted_area_id TEXT NOT NULL DEFAULT '';
CREATE INDEX orders_unlisted ON orders(unlisted_area_id);
`);
for (const e of entries.filter((x) => x.official && x.changed)) {
  lines.push(`UPDATE locations SET aliases = ${sql(JSON.stringify(e.aliases))}, weight = ${e.w}, source = ${sql(SRC_LABEL(e))} WHERE id = ${sql(e.id)};`);
}
const ins = newOnes.map((e) => `(${sql(e.id)}, ${sql(e.d)}, 'region', '', ${sql(e.en)}, ${sql(e.nameAr ?? "")}, ${sql(e.en)}, ${Number.isFinite(e.lat) ? e.lat.toFixed(6) : "NULL"}, ${Number.isFinite(e.lon) ? e.lon.toFixed(6) : "NULL"}, ${sql(JSON.stringify(e.aliases))}, ${e.w}, ${sql(SRC_LABEL(e))})`);
for (let i = 0; i < ins.length; i += 200) {
  lines.push(`INSERT INTO locations (id, parent_id, type, code, name_en, name_ar, official_name_en, lat, lon, aliases, weight, source) VALUES\n${ins.slice(i, i + 200).join(",\n")};`);
}
fs.writeFileSync(path.join(ROOT, "migrations", "0011_locations_v2.sql"), lines.join("\n") + "\n");
fs.mkdirSync(path.join(ROOT, "docs", "locations-v2"), { recursive: true });
const out = (name, header, rows) => fs.writeFileSync(path.join(ROOT, "docs", "locations-v2", name), csv([header, ...rows]));
out("new_places.csv", ["id", "name", "arabic", "district", "governorate", "sources", "weight", "aliases"], newOnes.map((e) => [e.id, e.en, e.nameAr, distById.get(e.d).en, govById.get(distById.get(e.d).gov).en, SRC_LABEL(e), e.w, e.aliases.join(" | ")]));
out("official_not_found_elsewhere.csv", ["id", "name", "arabic", "district"], unmatchedOfficial.map((e) => [e.id, e.en, e.nameAr, distById.get(e.d).en]));
out("merges.csv", ["region", "district", "aliases added", "source"], log.merges.map((m) => [m.region, m.district, m.added, m.src]));
out("fuzzy_merges.csv", ["kept as", "merged", "district", "why"], log.fuzzy.map((m) => [m.kept, m.merged, m.district, m.why]));
out("low_confidence.csv", ["id", "name", "district", "why"], lowConf.map((l) => [l.id, l.name, l.district, l.why]));
fs.writeFileSync(path.join(ROOT, "docs", "LOCATIONS-V2-REPORT.md"), report + "\n");
console.log(`wrote migrations/0011_locations_v2.sql (${(lines.join("\n").length / 1024).toFixed(0)} KB), docs/LOCATIONS-V2-REPORT.md and docs/locations-v2/*.csv`);
