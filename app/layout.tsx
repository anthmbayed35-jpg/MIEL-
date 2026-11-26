import type { Metadata, Viewport } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { SITE } from "@/config/site";
import { copy } from "@/config/copy";
import "./globals.css";

// One family: Archivo variable with the width axis (62–125) + weight axis.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

// The brand tagline (config/copy.ts) is in the title and the share text.
export function generateMetadata(): Metadata {
  const site = copy().site;
  return {
    metadataBase: new URL(SITE.url),
    title: { default: site.title, template: "%s | MIEL+" },
    description: site.description,
    openGraph: { title: site.title, description: site.description, siteName: SITE.name, type: "website", locale: "en_LB" },
    twitter: { card: "summary_large_image", title: site.title, description: site.description },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = {
  themeColor: "#23201C",
  colorScheme: "dark",
};

// Storefront chrome (cart, announcement, tracking) lives in app/(store)/layout.tsx; the admin has its own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
