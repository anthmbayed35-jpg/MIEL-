"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { SACHETS_PER_POUCH } from "@/config/site";
import { money } from "@/lib/format";
import { trackEvent } from "@/lib/track-client";
import { useCart } from "./CartProvider";

/**
 * The cart: products, flavour, quantity (plus and minus), line totals, subtotal, remove, and the Checkout button, which opens
 * the /checkout page. The cart lives in the browser (localStorage); prices are never trusted from here: /checkout and the order
 * action price everything again on the server.
 */
export function CartDrawer() {
  const { open, setOpen, lines, total, count, setQty, products } = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const items = Object.entries(lines)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id), qty }))
    .filter((x): x is { p: (typeof products)[number]; qty: number } => !!x.p && x.qty > 0);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const soldOut = items.some((i) => i.p.soldOut);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "visible" : "pointer-events-none invisible delay-300"}`} aria-hidden={!open} inert={!open}>
      <div className={`scrim absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`} onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className={`glass-strong absolute right-0 top-0 flex h-full w-full flex-col !rounded-none sm:max-w-[480px] sm:!rounded-l-[20px] transition-transform duration-300 motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="display text-[22px]">Cart ({count})</h2>
          <button ref={closeBtn} onClick={close} className="btn btn-ghost btn-sm" aria-label="Close cart">
            CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {items.length === 0 ? (
            <div>
              <p className="body-lg mb-6">Your cart is empty. Fuel up.</p>
              <Link href="/#lineup" onClick={close} className="btn btn-block">
                SHOP THE LINEUP
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {items.map(({ p, qty }) => (
                <li key={p.id} className="py-5 first:pt-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="display text-[20px]">{p.name}</p>
                      {p.flavor && <p className="mt-1 text-[16px] text-fg">{p.flavor}</p>}
                      <p className="mono mt-1">
                        {SACHETS_PER_POUCH} SACHETS · {money(p.price)}
                      </p>
                      {p.soldOut && <p className="mt-1 text-[15px] text-[#FF8AA0]">Sold out right now. Remove it to check out.</p>}
                    </div>
                    <p className="display text-[20px]">{money(p.price * qty)}</p>
                  </div>
                  <div className="mt-4 flex items-center">
                    <button className="btn btn-ghost btn-sm !min-w-14 !px-0" onClick={() => setQty(p.id, qty - 1)} aria-label={`Remove one ${p.name}`}>
                      −
                    </button>
                    <span className="display w-14 text-center text-[20px]" aria-live="polite">
                      {qty}
                    </span>
                    <button className="btn btn-ghost btn-sm !min-w-14 !px-0" onClick={() => setQty(p.id, qty + 1)} aria-label={`Add one ${p.name}`}>
                      +
                    </button>
                    <button className="link ml-auto text-[16px]" onClick={() => setQty(p.id, 0)} aria-label={`Remove ${p.name} from cart`}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-white/10 px-5 py-5">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="mono">SUBTOTAL</span>
              <span className="display accent text-[28px]">{money(total)}</span>
            </div>
            <p className="mb-4 text-[15px] text-body">Delivery is calculated at checkout.</p>
            {soldOut ? (
              <button className="btn btn-block opacity-60" disabled aria-disabled="true">
                REMOVE SOLD OUT ITEMS
              </button>
            ) : (
              <Link href="/checkout" onClick={() => { close(); trackEvent("begin_checkout"); }} className="btn btn-block">
                CHECKOUT
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
