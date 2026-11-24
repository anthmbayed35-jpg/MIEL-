import Link from "next/link";
import { can, requireAdmin } from "@/lib/auth";
import { BottomTabs, TopNav } from "@/components/admin/AdminNav";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { logout } from "../login/actions";
import { SearchButton } from "@/components/admin/SearchButton";
import { StatusBanners } from "@/components/admin/StatusBanners";
import { needsAction } from "@/lib/ambassador/admin";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // the number of new ambassador applications shows as a badge on the Affiliates menu item (refreshed with every page and live update)
  const badges: Record<string, number> = can(admin.role, "affiliates.read") ? { "/admin/affiliates": needsAction().total } : {};

  return (
    <div className="relative min-h-screen pb-32 lg:pb-12">
      <div className="sticky top-3 z-40 mx-3">
        <header className="glass-strong mx-auto flex max-w-[1400px] items-center justify-between gap-3 rounded-full px-5 py-[18px] md:px-8">
          <Link href="/admin" aria-label="Dashboard" className="-my-1.5 block shrink-0 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="h-9 w-auto" />
          </Link>
          <TopNav role={admin.role} badges={badges} />
          <div className="flex items-center gap-2">
            <SearchButton />
            <NotificationBell />
            <details className="relative">
              <summary className="icon-btn !border-white/20 list-none bg-fg !text-black [&::-webkit-details-marker]:hidden" aria-label="Account menu">
                <span className="display text-[16px] !text-black">{admin.name.slice(0, 1).toUpperCase()}</span>
              </summary>
              <div className="glass-strong absolute right-0 top-14 z-50 w-64 rounded-[24px] p-4">
                <p className="text-[16px] font-semibold text-fg">{admin.name}</p>
                <p className="text-[13px] text-body">{admin.email}</p>
                <p className="mono mt-2">{admin.role}</p>
                <Link href="/admin/account" className="pill-btn pill-glass mt-4 w-full">My account</Link>
                <form action={logout} className="mt-2">
                  <button className="pill-btn pill-glass w-full">Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </header>
      </div>
      <main className="relative mx-auto max-w-[1400px] px-4 pt-8 md:px-8">
        <StatusBanners />
        {children}
      </main>
      <BottomTabs role={admin.role} badges={badges} />
      <CommandPalette />
    </div>
  );
}
