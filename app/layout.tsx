import type { Metadata, Viewport } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { SITE } from "@/config/site";
import { CartProvider } from "@/components/CartProvider";
import { CartDrawer } from "@/components/CartDrawer";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "MIEL+ | Honey Sports Nutrition, Lebanon", template: "%s | MIEL+" },
  description: SITE.description,
  openGraph: {
    title: "MIEL+ | Fuel the grind.",
    description: SITE.description,
    siteName: SITE.name,
    type: "website",
    locale: "en_LB",
  },
  twitter: { card: "summary_large_image", title: "MIEL+ | Fuel the grind.", description: SITE.description },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#23201C",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <CartProvider>
          {children}
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
