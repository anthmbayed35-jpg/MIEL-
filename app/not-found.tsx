import Link from "next/link";
import { Header } from "@/components/Header";
import { Blobs } from "@/components/Blobs";
import { Footer } from "@/components/Sections";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "60%", y: "40%", delay: -9 }]} />
        <div className="mx-auto max-w-7xl px-5 pb-24 pt-[140px] md:px-8 md:pt-[180px]">
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
      <Footer />
    </>
  );
}
