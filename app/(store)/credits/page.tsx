import { getCatalog } from "@/lib/catalog";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credits", description: "Where the place names in our delivery address list come from.", alternates: { canonical: "/credits" } };

const SOURCES: { name: string; text: string; href: string; licence: string }[] = [
  { name: "OpenStreetMap", text: "Map data © OpenStreetMap contributors. Place names and their alternative spellings.", href: "https://www.openstreetmap.org/copyright", licence: "Open Database Licence (ODbL)" },
  { name: "GeoNames", text: "Place names and alternate names in many spellings, Arabic included.", href: "https://www.geonames.org", licence: "Creative Commons Attribution 4.0" },
  { name: "Humanitarian Data Exchange: Lebanon subnational boundaries", text: "Governorates and districts (COD-AB) by the Council for Development and Reconstruction (CDR) and OCHA.", href: "https://data.humdata.org/dataset/cod-ab-lbn", licence: "CC BY-IGO" },
  { name: "Central Administration of Statistics (Lebanon)", text: "The official list of villages, towns and cities, through the Humanitarian Data Exchange.", href: "https://data.humdata.org/dataset/lebanon-villages-settlements", licence: "CC BY" },
];

export default async function CreditsPage() {
  const cat = await getCatalog();
  return (
    <>
      <Header products={cat.products} />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "30%", delay: -9 }]} />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)]">
          <p className="mono mb-3">CREDITS</p>
          <h1 className="display h-section">Map data.</h1>
          <p className="body-lg mt-4">
            The list of areas you can choose at checkout combines official Lebanese data with open map data. Thank you to everyone who maintains it.
          </p>
          <ul className="mt-8 space-y-4">
            {SOURCES.map((s) => (
              <li key={s.name} className="glass p-5">
                <h2 className="display text-[20px]">{s.name}</h2>
                <p className="body-lg mt-2">{s.text}</p>
                <p className="mt-2 text-[16px] text-body">
                  Licence: {s.licence}.{" "}
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-12 items-center">
                    Source
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
