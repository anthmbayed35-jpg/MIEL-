import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { inMaintenance } from "@/lib/site-mode";

export const dynamic = "force-dynamic"; // SITE_MODE is read at request time

export default function robots(): MetadataRoute.Robots {
  // Under development: nothing may be indexed, and there is no sitemap to point at.
  if (inMaintenance()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }, sitemap: `${SITE.url}/sitemap.xml` };
}
