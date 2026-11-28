import Script from "next/script";
import { getCatalog } from "@/lib/catalog";
import { CartProvider } from "@/components/CartProvider";
import { CartDrawer } from "@/components/CartDrawer";
import { Tracker } from "@/components/Tracker";
import { PreviewBar } from "@/components/PreviewBar";
import { TopOffsets } from "@/components/TopBars";
import { AnnouncementStrip } from "@/components/AnnouncementStrip";
import { RefCapture } from "@/components/RefCapture";
import { previewAdmin } from "@/lib/preview";

// The storefront reads the database on every request (SQLite on the volume answers in well under a millisecond), so a
// price or stock change made in the admin is live immediately and a fresh deploy never shows stale pre-rendered data.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const cat = await getCatalog();
  const preview = !!(await previewAdmin()); // SITE_MODE=maintenance and a signed-in admin: the real storefront, for them only
  const { tracking } = cat;
  return (
    <CartProvider
      products={cat.products.map((p) => ({ id: p.id, name: p.name, price: p.price, slug: p.slug, flavor: p.flavor, soldOut: !!p.soldOut }))}
      deliveryFee={cat.deliveryFee}
      preview={preview}
    >
      {/* The top of every page, in this order: preview bar (admins), announcement strip, then the header (sticky, below the preview bar). */}
      {preview && <PreviewBar />}
      <AnnouncementStrip />
      <TopOffsets />
      <RefCapture />
      {/* No announcement bar: the storefront shows no offers, countdowns or scarcity (the admin keeps its discount and inventory tools). */}
      <div data-preview={preview ? "1" : undefined}>{children}</div>
      <CartDrawer />
      {!preview && <Tracker />}
      {tracking.ga4_id && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${tracking.ga4_id}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${tracking.ga4_id.replace(/[^A-Za-z0-9-]/g, "")}');`}</Script>
        </>
      )}
      {tracking.meta_pixel_id && (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${tracking.meta_pixel_id.replace(/[^0-9]/g, "")}');fbq('track','PageView');`}</Script>
      )}
    </CartProvider>
  );
}
