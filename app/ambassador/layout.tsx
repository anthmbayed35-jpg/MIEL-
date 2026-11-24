import type { Metadata } from "next";

// The portal is private: never indexed, never cached.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Ambassador portal", template: "%s | MIEL+ Ambassadors" }, robots: { index: false, follow: false, nocache: true } };

export default function AmbassadorRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
