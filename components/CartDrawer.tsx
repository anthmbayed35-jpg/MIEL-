"use client";

import { useEffect, useRef, useState } from "react";
import { products } from "@/config/products";
import { SACHETS_PER_POUCH } from "@/config/site";
import { money } from "@/lib/format";
import { buildOrder, storeOrder, whatsappUrl, type Customer } from "@/lib/order";
import { useCart } from "./CartProvider";

type View = "cart" | "checkout" | "done";

const field =
  "w-full min-h-14 bg-white/5 border border-white/15 px-4 py-3 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none";
const label = "mono block mb-2";

export function CartDrawer() {
  const { open, setOpen, lines, total, count, setQty, clear } = useCart();
  const [view, setView] = useState<View>("cart");
  const [waLink, setWaLink] = useState("");
  const [orderId, setOrderId] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const items = Object.entries(lines)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id), qty }))
    .filter((x): x is { p: (typeof products)[number]; qty: number } => !!x.p && x.qty > 0);

  const close = () => {
    setOpen(false);
    if (view === "done") setView("cart");
  };

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
      const f = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, textarea, [tabindex]:not([tabindex="-1"])',
      );
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

  // Back to the cart view if the cart empties out from under checkout.
  useEffect(() => {
    if (view === "checkout" && items.length === 0) setView("cart");
  }, [view, items.length]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customer: Customer = {
      name: String(fd.get("name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      address: String(fd.get("address") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim(),
    };
    const order = buildOrder(lines, customer);
    storeOrder(order);
    const url = whatsappUrl(order);
    setWaLink(url);
    setOrderId(order.id);
    window.open(url, "_blank", "noopener");
    clear();
    setView("done");
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "visible" : "pointer-events-none invisible delay-300"}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className={`scrim absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        className={`glass-strong absolute right-0 top-0 flex h-full w-full flex-col !rounded-none sm:max-w-[480px] sm:!rounded-l-[20px] transition-transform duration-300 motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="display text-[22px]">
            {view === "checkout" ? "Checkout" : view === "done" ? "Order sent" : `Cart (${count})`}
          </h2>
          <button ref={closeBtn} onClick={close} className="btn btn-ghost btn-sm" aria-label="Close cart">
            CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {view === "cart" &&
            (items.length === 0 ? (
              <div>
                <p className="body-lg mb-6">Your cart is empty. Fuel up.</p>
                <a href="/#lineup" onClick={close} className="btn btn-block">
                  SHOP THE LINEUP
                </a>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {items.map(({ p, qty }) => (
                  <li key={p.id} className="py-5 first:pt-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="display text-[20px]">{p.name}</p>
                        <p className="mono mt-1">
                          {SACHETS_PER_POUCH} SACHETS · {money(p.price)}
                        </p>
                      </div>
                      <p className="display text-[20px]">{money(p.price * qty)}</p>
                    </div>
                    <div className="mt-4 flex items-center">
                      <button
                        className="btn btn-ghost btn-sm !min-w-14 !px-0"
                        onClick={() => setQty(p.id, qty - 1)}
                        aria-label={`Remove one ${p.name}`}
                      >
                        −
                      </button>
                      <span className="display w-14 text-center text-[20px]" aria-live="polite">
                        {qty}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm !min-w-14 !px-0"
                        onClick={() => setQty(p.id, qty + 1)}
                        aria-label={`Add one ${p.name}`}
                      >
                        +
                      </button>
                      <button
                        className="link ml-auto text-[16px]"
                        onClick={() => setQty(p.id, 0)}
                        aria-label={`Remove ${p.name} from cart`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {view === "checkout" && (
            <form id="checkout" onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="name" className={label}>Full name</label>
                <input id="name" name="name" required autoComplete="name" className={field} placeholder="Your name" />
              </div>
              <div>
                <label htmlFor="phone" className={label}>Phone (WhatsApp)</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  minLength={7}
                  autoComplete="tel"
                  inputMode="tel"
                  className={field}
                  placeholder="+961 …"
                />
              </div>
              <div>
                <label htmlFor="address" className={label}>Delivery address</label>
                <textarea
                  id="address"
                  name="address"
                  required
                  rows={3}
                  autoComplete="street-address"
                  className={field}
                  placeholder="City, street, building, floor"
                />
              </div>
              <div>
                <label htmlFor="notes" className={label}>Notes (optional)</label>
                <textarea id="notes" name="notes" rows={2} className={field} placeholder="Anything we should know" />
              </div>
              <div className="glass p-4">
                <p className="mono">PAYMENT</p>
                <p className="display mt-1 text-[18px]">Cash on delivery</p>
                <p className="mt-1 text-[16px]">Pay when it arrives. Delivery details confirmed on WhatsApp.</p>
              </div>
            </form>
          )}

          {view === "done" && (
            <div>
              <p className="mono">ORDER {orderId}</p>
              <p className="display mt-2 text-[26px]">
                Almost there<span className="accent">.</span>
              </p>
              <p className="body-lg mt-4 mb-6">
                WhatsApp should have opened with your order. Hit send there and we&apos;ll confirm delivery. Didn&apos;t
                open?
              </p>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-block">
                OPEN WHATSAPP
              </a>
            </div>
          )}
        </div>

        {view === "cart" && items.length > 0 && (
          <div className="border-t border-white/10 px-5 py-5">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="mono">TOTAL</span>
              <span className="display text-[28px] accent">{money(total)}</span>
            </div>
            <button className="btn btn-block" onClick={() => setView("checkout")}>
              CHECKOUT
            </button>
          </div>
        )}
        {view === "checkout" && (
          <div className="border-t border-white/10 px-5 py-5">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="mono">TOTAL</span>
              <span className="display text-[28px] accent">{money(total)}</span>
            </div>
            <button type="submit" form="checkout" className="btn btn-block">
              PLACE ORDER
            </button>
            <button type="button" onClick={() => setView("cart")} className="link mt-2 w-full text-center text-[16px]">
              Back to cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
