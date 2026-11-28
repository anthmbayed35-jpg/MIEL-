"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./CartProvider";

type Nav = { shop: string; moments: string; how: string; faq: string; menu: string; panelTitle: string; panelAll: string };

const link = "inline-flex min-h-12 items-center px-3 text-[14px] font-semibold uppercase tracking-[0.1em] text-fg hover:text-acid font-[family-name:var(--font-space-mono)]";

/**
 * The 56px header. Sticky; it slides away when you scroll down and comes back as soon as you scroll up (always visible near the top
 * and while a menu is open). Desktop: links plus a "Shop by moment" dropdown. Phone: a menu button that opens the same links and cards.
 */
export function HeaderBar({ panel, nav }: { panel: React.ReactNode; nav: Nav }) {
  const { count, open: cartOpen, setOpen } = useCart();
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  const [shop, setShop] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setSolid(y > 8);
        if (y < 80) setHidden(false);
        else if (y > last.current + 6) setHidden(true);
        else if (y < last.current - 6) setHidden(false);
        last.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // adding to the cart or opening/closing the drawer brings the header (and its cart button) back
  useEffect(() => {
    setHidden(false);
    last.current = window.scrollY;
  }, [count, cartOpen]);

  // Escape and a click outside close the panels
  useEffect(() => {
    if (!menu && !shop) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setShop(false);
      }
    };
    const click = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setMenu(false);
        setShop(false);
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [menu, shop]);

  const close = () => {
    setMenu(false);
    setShop(false);
  };
  const open = menu || shop;
  const gone = hidden && !open;

  return (
    <div ref={root} className="site-header sticky z-40" style={{ transform: gone ? "translateY(-110%)" : "none", transition: "transform 250ms ease-out" }} inert={gone}>
      <header className={`relative h-14 border-b ${solid || open ? "border-white/10 bg-bg/85 backdrop-blur-md" : "border-transparent bg-gradient-to-b from-black/50 to-transparent"}`}>
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-4 md:px-8">
          {/* logo 32px tall + 12px above and below = half its height of clear space on each side, in 56px */}
          <Link href="/" aria-label="MIEL+ home" className="block py-3" onClick={close}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="h-8 w-auto" />
          </Link>

          <nav aria-label="Primary" className="hidden items-center md:flex">
            <button type="button" aria-expanded={shop} aria-controls="shop-panel" className={`${link} gap-2`} onClick={() => setShop((v) => !v)}>
              {nav.shop}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={shop ? "rotate-180" : ""}>
                <path d="m2 4 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Link href="/#moments" className={link} onClick={close}>{nav.moments}</Link>
            <Link href="/#how-it-works" className={link} onClick={close}>{nav.how}</Link>
            <Link href="/#faq" className={link} onClick={close}>{nav.faq}</Link>
          </nav>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setOpen(true); close(); }} className="icon-btn" aria-label={`Open cart, ${count} items`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 8h14l-1 12H6L5 8Z" strokeLinejoin="round" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
              </svg>
              {count > 0 && <span className="badge">{count}</span>}
            </button>
            <button type="button" aria-expanded={menu} aria-controls="mobile-menu" aria-label={nav.menu} className="icon-btn md:!hidden" onClick={() => setMenu((v) => !v)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                {menu ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* desktop: the shop-by-moment dropdown */}
        {shop && (
          <div id="shop-panel" className="absolute inset-x-0 top-full hidden border-b border-white/10 bg-bg/95 backdrop-blur-md md:block" onMouseLeave={() => setShop(false)}>
            <div className="mx-auto max-w-[1280px] px-8 py-6">
              <p className="eyebrow mb-4">{nav.panelTitle}</p>
              {panel}
              <p className="mt-4">
                <Link href="/products" className="link inline-flex min-h-12 items-center text-[15px]" onClick={close}>{nav.panelAll}</Link>
              </p>
            </div>
          </div>
        )}

        {/* phone: the menu, with the same cards */}
        {menu && (
          <div id="mobile-menu" className="absolute inset-x-0 top-full max-h-[calc(100svh-56px)] overflow-y-auto border-b border-white/10 bg-bg/95 backdrop-blur-md md:hidden">
            <div className="px-4 py-4">
              <ul>
                {[
                  [nav.moments, "/#moments"],
                  [nav.how, "/#how-it-works"],
                  [nav.faq, "/#faq"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="display flex min-h-14 items-center border-b border-white/10 text-[20px]" onClick={close}>{label}</Link>
                  </li>
                ))}
              </ul>
              <p className="eyebrow mb-3 mt-6">{nav.panelTitle}</p>
              {panel}
              <p className="mt-3">
                <Link href="/products" className="link inline-flex min-h-12 items-center text-[15px]" onClick={close}>{nav.panelAll}</Link>
              </p>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
