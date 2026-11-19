import { notFound } from "next/navigation";
import { inMaintenance } from "@/lib/site-mode";
import { Blobs } from "@/components/Blobs";

// Served with HTTP 503 by proxy.ts (a rewrite) while SITE_MODE=maintenance. Never indexed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Under development", robots: { index: false, follow: false, noarchive: true } };

export default function MaintenancePage() {
  if (!inMaintenance()) notFound(); // the page does not exist when the site is live
  return (
    <main className="relative isolate flex min-h-screen items-center overflow-x-clip px-5 py-16 md:px-8">
      <Blobs spots={[{ x: "-10%", y: "5%" }, { x: "60%", y: "35%" }]} />
      <div className="mx-auto w-full max-w-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} className="h-auto w-[min(80vw,520px)]" />
        <h1 className="display h-section mt-12">
          MIEL+ is under development<span className="accent">.</span>
        </h1>
        <p className="body-lg mt-6 max-w-xl text-[20px]">Something new is coming. Stay tuned.</p>
      </div>
    </main>
  );
}
