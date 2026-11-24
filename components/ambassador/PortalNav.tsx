"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/ambassador", "Home"],
  ["/ambassador/link", "My link"],
  ["/ambassador/sales", "Sales"],
  ["/ambassador/payouts", "Payouts"],
  ["/ambassador/missions", "Missions"],
  ["/ambassador/kit", "Kit"],
  ["/ambassador/resources", "Resources"],
  ["/ambassador/leaderboard", "Top 10"],
  ["/ambassador/news", "News"],
  ["/ambassador/profile", "Profile"],
];

/** Horizontally scrollable tabs: one thumb swipe on a phone. */
export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Portal" className="mx-auto mt-3 max-w-5xl overflow-x-auto px-3 md:px-8">
      <ul className="flex w-max gap-2 py-1">
        {ITEMS.map(([href, text]) => {
          const on = href === "/ambassador" ? path === href : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined} className={`mono flex min-h-12 items-center rounded-full border px-4 ${on ? "border-acid bg-acid !text-black" : "glass-flat border-white/15"}`}>
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
