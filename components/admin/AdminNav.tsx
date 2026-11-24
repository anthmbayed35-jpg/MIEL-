"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { can, type Perm } from "@/lib/roles";
import type { Role } from "@/lib/roles";

type Item = { href: string; label: string; perm?: Perm; icon: string };
/** Small numbers shown on a menu item (for example the new applications on Affiliates), keyed by its href. */
export type Badges = Record<string, number>;

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="ml-2 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-acid px-1.5 text-[13px] font-bold leading-none text-black" aria-label={`${n} new`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

const MAIN: Item[] = [
  { href: "/admin", label: "Dashboard", icon: "M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" },
  { href: "/admin/orders", label: "Orders", perm: "orders.read", icon: "M6 2h12l2 5H4l2-5Zm-2 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Zm5 3v2h6v-2H9Z" },
  { href: "/admin/affiliates", label: "Ambassadors", perm: "affiliates.read", icon: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-6 1.3-6 4v2h12v-2c0-2.7-3.3-4-6-4Zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2.2 2 3.9v2h5v-2c0-2.7-3.3-4-6-4Z" },
  { href: "/admin/products", label: "Products", perm: "products.read", icon: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.5 8 12 11.7 5.5 8 12 4.3ZM5 9.7l6 3.4v6.7l-6-3.3V9.7Zm14 0v6.8l-6 3.3v-6.7l6-3.4Z" },
  { href: "/admin/customers", label: "Customers", perm: "customers.read", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0H4Z" },
  { href: "/admin/inventory", label: "Inventory", perm: "inventory.read", icon: "M3 7l9-4 9 4v10l-9 4-9-4V7Zm9 2 6-2.7M12 9v11M12 9 6 6.3" },
  { href: "/admin/marketing", label: "Marketing", perm: "marketing.manage", icon: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm13-3a5 5 0 0 1 0 8" },
  { href: "/admin/analytics", label: "Analytics", perm: "analytics.read", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { href: "/admin/settings", label: "Settings", perm: "settings.read", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5.1-1 2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.3a7 7 0 0 0-1.7 1l-2.4-.8-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-.8a7 7 0 0 0 1.7 1L11 21h4l.4-2.3a7 7 0 0 0 1.7-1l2.4.8 2-3.5-2-1.5Z" },
];

const MORE_EXTRA: Item[] = [
  { href: "/admin/marketing/discounts", label: "Discounts", perm: "discounts.manage", icon: "" },
  { href: "/admin/marketing/content", label: "Content", perm: "content.manage", icon: "" },
  { href: "/admin/settings/shipping", label: "Shipping", perm: "shipping.manage", icon: "" },
  { href: "/admin/settings/team", label: "Team", perm: "team.manage", icon: "" },
  { href: "/admin/settings/activity", label: "Activity log", perm: "audit.read", icon: "" },
];

const active = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));

export function TopNav({ role, badges = {} }: { role: Role; badges?: Badges }) {
  const path = usePathname();
  const items = MAIN.filter((i) => !i.perm || can(role, i.perm));
  return (
    <nav aria-label="Admin" className="hidden items-center gap-1 rounded-full bg-black/25 p-1 lg:flex">
      {items.map((i) => {
        const on = active(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium transition-colors ${on ? "bg-fg text-black" : "text-body hover:bg-white/10 hover:text-fg"}`}
          >
            {i.label}
            <Badge n={badges[i.href]} />
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Mobile: bottom tab bar (5 most used) + "More" sheet. */
export function BottomTabs({ role, badges = {} }: { role: Role; badges?: Badges }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  // filter first, then take the first four, so a role without some sections still gets four tabs
  const allowed = MAIN.filter((i) => !i.perm || can(role, i.perm));
  const tabs = allowed.slice(0, 4);
  const rest = [...allowed.slice(4), ...MORE_EXTRA.filter((i) => !i.perm || can(role, i.perm))];
  const moreActive = rest.some((i) => active(path, i.href));
  return (
    <>
      <nav aria-label="Admin sections" className="glass-strong fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[26px] p-1.5 pb-[max(6px,env(safe-area-inset-bottom))] lg:hidden">
        {tabs.map((i) => {
          const on = active(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[13px] font-medium ${on ? "bg-fg text-black" : "text-body"}`}>
              <span className="relative">
                <Icon d={i.icon} />
                {badges[i.href] ? <span className="absolute -right-2.5 -top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-acid px-1 text-[13px] font-bold leading-none text-black" aria-label={`${badges[i.href]} new`}>{badges[i.href]}</span> : null}
              </span>
              {i.label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-haspopup="dialog" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[13px] font-medium ${moreActive ? "bg-fg text-black" : "text-body"}`}>
          <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
          More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button className="scrim absolute inset-0" aria-label="Close menu" onClick={() => setMore(false)} />
          <div className="glass-strong absolute inset-x-3 bottom-3 rounded-[28px] p-4 pb-5">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="display text-[18px]">More</p>
              <button onClick={() => setMore(false)} className="pill-btn pill-glass">Close</button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setMore(false)} className={`flex min-h-14 items-center rounded-2xl px-4 text-[16px] font-medium ${active(path, i.href) ? "bg-fg text-black" : "bg-white/8 text-fg"}`}>
                    {i.label}
                    <Badge n={badges[i.href]} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
