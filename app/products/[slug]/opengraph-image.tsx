import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getProduct, products } from "@/config/products";

export const alt = "MIEL+ product";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

// Per-product Open Graph image: M+ logo, product name and flavour glow on #23201C.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getProduct(slug);
  if (p?.ogImage) {
    // Ready-made 1200x630 share image (see scripts/make-images.mjs)
    const file = await readFile(path.join(process.cwd(), "public", p.ogImage));
    return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/png" } });
  }
  const logo = await readFile(path.join(process.cwd(), "public/brand/miel-m-plus.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#23201C",
          color: "#F2EFE8",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -120,
            width: 720,
            height: 720,
            borderRadius: 360,
            background: `radial-gradient(circle, ${p?.glow ?? "rgba(218,252,105,0.3)"} 0%, rgba(35,32,28,0) 70%)`,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={196} height={125} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, letterSpacing: 4, color: "#DAFC69", textTransform: "uppercase" }}>
            {p?.descriptor ?? "Honey sports nutrition"}
          </div>
          <div style={{ fontSize: 140, fontWeight: 900, lineHeight: 1.05, textTransform: "uppercase" }}>
            {p?.name ?? "MIEL+"}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
