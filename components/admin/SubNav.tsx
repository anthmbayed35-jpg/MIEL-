"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Perm, type Role } from "@/lib/roles";

export type SubItem = { href: string; label: string; perm?: Perm };

/** Section tabs shown under a page title (Marketing, Settings). */
export function SubNav({ items, role }: { items: SubItem[]; role: Role }) {
  const path = usePathname();
  const visible = items.filter((i) => !i.perm || can(role, i.perm));
  return (
    <nav aria-label="Section" className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1">
      {visible.map((i) => {
        const on = path === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-12 shrink-0 items-center rounded-full px-5 text-[15px] font-medium ${on ? "bg-fg text-black" : "bg-white/8 text-body hover:text-fg"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const MARKETING_TABS: SubItem[] = [
  { href: "/admin/marketing", label: "Overview", perm: "marketing.manage" },
  { href: "/admin/marketing/discounts", label: "Discounts", perm: "discounts.manage" },
  { href: "/admin/marketing/content", label: "Content", perm: "content.manage" },
];
export const SETTINGS_TABS: SubItem[] = [
  { href: "/admin/settings", label: "Store", perm: "settings.read" },
  { href: "/admin/settings/shipping", label: "Shipping & delivery", perm: "shipping.manage" },
  { href: "/admin/settings/team", label: "Team", perm: "team.manage" },
  { href: "/admin/settings/activity", label: "Activity log", perm: "audit.read" },
];
