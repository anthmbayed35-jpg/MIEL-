import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { adminRegions, adminTree, searchLocations, unlistedCount } from "@/lib/locations";
import { settingsTabs } from "@/lib/admin-tabs";
import { ActionForm } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { Card, Empty, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { addRegionAction, updateLocation } from "./actions";

export const metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

type Row = { id: string; name_en: string; name_ar: string; official_name_en: string; hidden: number; custom: number; version: number; sub?: string; type?: string; aliases?: string; source?: string };

const aliasText = (json?: string) => {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a.join(", ") : "";
  } catch {
    return "";
  }
};

/** One place: rename (English + Arabic) and hide/show, in a single form so a phone shows one card per place. */
function PlaceForm({ r }: { r: Row }) {
  return (
    <ActionForm action={updateLocation} className="rounded-2xl bg-white/5 p-3">
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="version" value={r.version} />
      <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto_auto]">
        <Field label={r.type ? `${r.type} · ${r.sub ?? ""}` : "Name"}>
          <input name="name_en" required minLength={2} maxLength={80} defaultValue={r.name_en} className="a-input" aria-label={`English name of ${r.official_name_en || r.name_en}`} />
        </Field>
        <Field label="Arabic name">
          <input name="name_ar" maxLength={80} dir="rtl" lang="ar" defaultValue={r.name_ar} className="a-input" aria-label={`Arabic name of ${r.official_name_en || r.name_en}`} />
        </Field>
        {r.aliases !== undefined && (!r.type || r.type === "Region") ? (
          <Field label="Other spellings (aliases)">
            <input name="aliases" defaultValue={aliasText(r.aliases)} maxLength={400} className="a-input" placeholder="Antilias, Antélias, انطلياس" aria-label={`Aliases of ${r.official_name_en || r.name_en}`} />
          </Field>
        ) : <span />}
        <button name="op" value="save" className="pill-btn pill-glass">Save</button>
        <button name="op" value={r.hidden ? "show" : "hide"} className={`pill-btn ${r.hidden ? "pill-lime" : "pill-glass"}`}>{r.hidden ? "Show at checkout" : "Hide"}</button>
      </div>
      <p className="mt-2 text-[13px] text-body">
        {r.hidden ? <span className="text-[#FF8AA0]">Hidden: not offered at checkout. </span> : null}
        {r.custom ? "Added by you. " : r.official_name_en && r.official_name_en !== r.name_en ? `Official name: ${r.official_name_en}. ` : ""}
        {r.source && r.source !== "cas" ? `Source: ${r.source.replace(/\+/g, ", ")}. ` : ""}
      </p>
    </ActionForm>
  );
}

/** Settings > Locations: search every place, rename, hide or show districts and regions, add a missing region. */
export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ q?: string; district?: string; rq?: string }> }) {
  const admin = await requirePerm("shipping.manage");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tree = adminTree();
  const district = tree.flatMap((g) => g.districts.map((d) => ({ ...d, gov: g.name_en }))).find((d) => d.id === sp.district);
  const results = q ? searchLocations(q) : [];
  const regions = district ? adminRegions(district.id, sp.rq ?? "") : null;
  const totalRegions = tree.reduce((n, g) => n + g.regions, 0);
  const hiddenRegions = tree.reduce((n, g) => n + g.districts.reduce((m, d) => m + (d.regions - d.visible), 0), 0);

  return (
    <>
      <PageHeader eyebrow="Where you deliver" title="Locations" />
      <SubNav items={settingsTabs(unlistedCount())} role={admin.role} />
      {unlistedCount() > 0 && (
        <Link href="/admin/settings/locations/unlisted" className="admin-card mb-5 flex min-h-12 items-center justify-between gap-3 !py-3 text-[17px] text-fg">
          <span>{unlistedCount()} unlisted area{unlistedCount() === 1 ? "" : "s"} typed by customers</span>
          <span className="accent">Review →</span>
        </Link>
      )}

      <Card className="mb-5">
        <p className="text-[16px] text-body">
          {tree.length} governorates, {tree.reduce((n, g) => n + g.districts.length, 0)} districts and {totalRegions} regions, combined from the official data (CAS, CDR/OCHA), OpenStreetMap and GeoNames, with their other spellings as aliases. Delivery is a flat fee everywhere.
          {hiddenRegions > 0 && <> {hiddenRegions} regions are hidden.</>} Hide a district or region you do not deliver to; customers will not see it. Renaming never changes orders already placed.
        </p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
          <input name="q" defaultValue={q} placeholder="Search any place, in English or Arabic" className="a-input" aria-label="Search locations" />
          <button className="pill-btn pill-lime">Search</button>
          {q && <Link href="/admin/settings/locations" className="pill-btn pill-glass">Clear</Link>}
        </form>
      </Card>

      {q && (
        <Card className="mb-5">
          <SectionTitle>{results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;{results.length === 60 ? " (the first 60)" : ""}</SectionTitle>
          {results.length === 0 ? (
            <Empty title="Nothing found." hint="Try the English or the Arabic spelling, or part of the name." />
          ) : (
            <div className="space-y-3">
              {results.map((r) => (
                <div key={r.id}>
                  <PlaceForm r={{ ...r, type: r.type === "region" ? "Region" : r.type === "district" ? "District" : "Governorate", sub: [r.district && r.type === "region" ? r.district : "", r.governorate].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") }} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!q && !district && (
        <div className="space-y-5">
          {tree.map((g) => (
            <Card key={g.id}>
              <SectionTitle right={<span className="mono !text-[14px]">{g.regions} regions</span>}>{g.name_en} <span lang="ar" dir="rtl" className="text-body">{g.name_ar}</span></SectionTitle>
              <ul className="space-y-1">
                {g.districts.map((d) => (
                  <li key={d.id}>
                    <Link href={`/admin/settings/locations?district=${d.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 text-[17px] text-fg hover:bg-white/5">
                      <span>
                        {d.name_en} <span lang="ar" dir="rtl" className="text-body">{d.name_ar}</span>
                        {d.hidden ? <span className="ml-2 text-[14px] text-[#FF8AA0]">hidden</span> : null}
                      </span>
                      <span className="text-[15px] text-body">
                        {d.regions} regions{d.visible !== d.regions ? `, ${d.visible} shown` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {!q && district && regions && (
        <>
          <Card className="mb-5">
            <Link href="/admin/settings/locations" className="link inline-flex min-h-12 items-center text-[15px]">← All districts</Link>
            <SectionTitle right={<span className="mono !text-[14px]">{regions.total} regions</span>}>{district.name_en} <span className="text-body">· {district.gov}</span></SectionTitle>
            <PlaceForm r={{ id: district.id, name_en: district.name_en, name_ar: district.name_ar, official_name_en: district.name_en, hidden: district.hidden, custom: 0, version: district.version, type: "District", sub: district.gov }} />
            <form className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
              <input type="hidden" name="district" value={district.id} />
              <input name="rq" defaultValue={sp.rq ?? ""} placeholder={`Search the regions of ${district.name_en}`} className="a-input" aria-label="Search regions" />
              <button className="pill-btn pill-glass">Search</button>
            </form>
          </Card>

          <Card className="mb-5">
            <SectionTitle>Add a missing region to {district.name_en}</SectionTitle>
            <ActionForm action={addRegionAction} resetOnSuccess className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
              <input type="hidden" name="district" value={district.id} />
              <Field label="Region name (English)"><input name="name_en" required minLength={2} maxLength={80} className="a-input" /></Field>
              <Field label="Arabic name (optional)"><input name="name_ar" maxLength={80} dir="rtl" lang="ar" className="a-input" /></Field>
              <Field label="Other spellings (optional)"><input name="aliases" maxLength={400} className="a-input" placeholder="comma separated" /></Field>
              <button className="pill-btn pill-lime">Add region</button>
            </ActionForm>
          </Card>

          <Card>
            <SectionTitle>Regions{sp.rq ? ` matching "${sp.rq}"` : ""} ({regions.rows.length})</SectionTitle>
            {regions.rows.length === 0 ? (
              <Empty title="No region matches." />
            ) : (
              <div className="space-y-3">
                {regions.rows.map((r) => <PlaceForm key={r.id} r={r} />)}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
