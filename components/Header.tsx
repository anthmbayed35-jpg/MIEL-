"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export function Header() {
  const { count, setOpen } = useCart();
  // Sticky floating pill, 12px from the screen edges and just below the preview bar (--preview-h, measured by TopOffsets).
  // Its negative bottom margin (globals.css, .site-header) lets the hero start right under it.
  return (
    <div className="site-header sticky z-40 mx-3">
      <header className="glass-strong mx-auto max-w-7xl rounded-full">
        {/* Vertical padding = half the logo height (18px mobile / 22px desktop) keeps the clear zone. */}
        <div className="flex items-center justify-between px-6 py-[18px] md:px-8 md:py-[22px]">
          <Link href="/" aria-label="MIEL+ home" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="h-9 w-auto md:h-11" />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-3">
            <Link href="/#lineup" className="btn btn-sm">
              SHOP
            </Link>
            <button onClick={() => setOpen(true)} className="icon-btn" aria-label={`Open cart, ${count} items`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 8h14l-1 12H6L5 8Z" strokeLinejoin="round" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
              </svg>
              {count > 0 && <span className="badge">{count}</span>}
            </button>
          </nav>
        </div>
      </header>
    </div>
  );
}
