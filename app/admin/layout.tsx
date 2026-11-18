import type { Metadata } from "next";

// Admin is never indexed: meta robots here + X-Robots-Tag header in proxy.ts + Disallow in robots.txt.
export const metadata: Metadata = {
  title: { default: "Admin | MIEL+", template: "%s | MIEL+ Admin" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-body">{children}</div>;
}
