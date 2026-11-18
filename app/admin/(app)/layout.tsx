import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { dbMode, getDb, must } from "@/lib/db";
import { seedBase } from "@/lib/seed";
import { BottomTabs, TopNav } from "@/components/admin/AdminNav";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { logout } from "../login/actions";
import { SearchButton } from "@/components/admin/SearchButton";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Local dev convenience: fill the (file) database from config/products.ts on first run.
  if (dbMode() === "local" && !must(await getDb().from("products").select("id").limit(1)).length) await seedBase();

  return (
    <div className="relative min-h-screen pb-32 lg:pb-12">
      <div className="sticky top-3 z-40 mx-3">
        <header className="glass-strong mx-auto flex max-w-[1400px] items-center justify-between gap-3 rounded-full px-5 py-[18px] md:px-8">
          <Link href="/admin" aria-label="Dashboard" className="block shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="h-9 w-auto" />
          </Link>
          <TopNav role={admin.role} />
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
                <form action={logout} className="mt-4">
                  <button className="pill-btn pill-glass w-full">Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </header>
      </div>
      <main className="relative mx-auto max-w-[1400px] px-4 pt-8 md:px-8">{children}</main>
      <BottomTabs role={admin.role} />
      <CommandPalette />
    </div>
  );
}
