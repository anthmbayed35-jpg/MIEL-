import { getCatalog } from "@/lib/catalog";
import { checkoutTree, searchIndexVersion } from "@/lib/locations";
import { activePaymentMethods } from "@/lib/payments";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const cat = await getCatalog();
  const methods = activePaymentMethods(cat.store.cod_enabled).map((m) => ({ id: m.id, label: m.label, description: m.description }));
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "35%", delay: -9 }]} />
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)]">
          <p className="mono mb-3">CHECKOUT</p>
          <h1 className="display h-section mb-8">
            Almost there<span className="accent">.</span>
          </h1>
          <CheckoutForm methods={methods} whatsapp={cat.store.whatsapp} tree={checkoutTree()} indexVersion={searchIndexVersion()} mapsKey={process.env.GOOGLE_MAPS_API_KEY ?? ""} />
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
