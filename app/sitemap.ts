import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { products } from "@/config/products";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...products.map((p) => ({
      url: `${SITE.url}/products/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
