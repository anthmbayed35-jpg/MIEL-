import Link from "next/link";
import { Blobs } from "@/components/Blobs";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="relative isolate min-h-screen overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "60%", y: "40%", delay: -9 }]} />
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-[120px] md:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-10 h-11 w-auto" />
        <p className="mono mb-3">ERROR 404</p>
        <h1 className="display h-hero">
          Wrong <span className="accent">turn.</span>
        </h1>
        <p className="body-lg mt-5 max-w-xl">That page doesn&apos;t exist. Get back on the route.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/#lineup" className="btn">
            SHOP THE LINEUP
          </Link>
          <Link href="/" className="btn btn-ghost">
            BACK HOME
          </Link>
        </div>
      </div>
    </main>
  );
}
