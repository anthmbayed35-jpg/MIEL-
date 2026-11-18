"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SACHETS_PER_POUCH } from "@/config/site";
import { money } from "@/lib/format";
import { getUtm, trackEvent } from "@/lib/track-client";
import { captureCheckout, placeOrder, quoteAction, type QuoteView } from "@/app/actions/checkout";
import { useCart } from "./CartProvider";

type View = "cart" | "checkout" | "done";

const field =
  "w-full min-h-14 bg-white/5 border border-white/15 px-4 py-3 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none";
const label = "mono block mb-2";

export function CartDrawer() {
  const { open, setOpen, lines, total, count, setQty, clear, products, zones } = useCart();
  const [view, setView] = useState<View>("cart");
  const [waLink, setWaLink] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [region, setRegion] = useState("");
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const items = Object.entries(lines)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id), qty }))
    .filter((x): x is { p: (typeof products)[number]; qty: number } => !!x.p && x.qty > 0);
  const cartInput = items.map((i) => ({ productId: i.p.id, qty: i.qty }));
  const cartKey = JSON.stringify(cartInput);

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

  useEffect(() => {
    if (view === "checkout" && items.length === 0) setView("cart");
  }, [view, items.length]);

  // Live price (delivery zone + discount code), computed on the server
  useEffect(() => {
    if (view !== "checkout" || !cartInput.length) return;
    let live = true;
    quoteAction(cartInput, region, code).then((q) => live && setQuote(q));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cartKey, region, code]);

  function startCheckout() {
    setError("");
    setView("checkout");
    trackEvent("begin_checkout");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await placeOrder({
      items: cartInput,
      customer: {
        name: String(fd.get("name") ?? "").trim(),
        phone: String(fd.get("phone") ?? "").trim(),
        address: String(fd.get("address") ?? "").trim(),
        notes: String(fd.get("notes") ?? "").trim(),
      },
      region,
      code,
      utm: getUtm(),
      website: String(fd.get("website") ?? ""),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setWaLink(res.whatsappUrl);
    setOrderId(res.orderNumber);
    window.open(res.whatsappUrl, "_blank", "noopener");
    clear();
    setView("done");
  }

  const shown = quote?.ok ? quote : null;

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
          <h2 className="display text-[22px]">{view === "checkout" ? "Checkout" : view === "done" ? "Order sent" : `Cart (${count})`}</h2>
          <button ref={closeBtn} onClick={close} className="btn btn-ghost btn-sm" aria-label="Close cart">
            CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {view === "cart" &&
            (items.length === 0 ? (
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
                        <p className="mono mt-1">
                          {SACHETS_PER_POUCH} SACHETS · {money(p.price)}
                        </p>
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
            ))}

          {view === "checkout" && (
            <form id="checkout" onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="name" className={label}>Full name</label>
                <input id="name" name="name" required autoComplete="name" className={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="phone" className={label}>Phone (WhatsApp)</label>
                <input
                  id="phone" name="phone" type="tel" required minLength={7} autoComplete="tel" inputMode="tel" className={field}
                  placeholder="03 123 456 or +961 70 123 456" value={phone} onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => phone.length >= 7 && captureCheckout({ name, phone, items: cartInput, utm_source: getUtm().source })}
                />
              </div>
              {zones.length > 0 && (
                <div>
                  <label htmlFor="region" className={label}>Delivery area</label>
                  <select id="region" name="region" required className={field} value={region} onChange={(e) => setRegion(e.target.value)}>
                    <option value="">Choose your area</option>
                    {zones.map((z) => (
                      <option key={z.name} value={z.name}>
                        {z.name} ({z.fee ? money(z.fee) : "free"}{z.free_over ? `, free over ${money(z.free_over)}` : ""})
                      </option>
                    ))}
                  </select>
                  {shown?.eta && <p className="mt-2 text-[15px]">Estimated delivery: {shown.eta}</p>}
                </div>
              )}
              <div>
                <label htmlFor="address" className={label}>Delivery address</label>
                <textarea id="address" name="address" required rows={3} autoComplete="street-address" className={field} placeholder="City, street, building, floor" />
              </div>
              <div>
                <label htmlFor="notes" className={label}>Notes (optional)</label>
                <textarea id="notes" name="notes" rows={2} className={field} placeholder="Anything we should know" />
              </div>
              <div>
                <label htmlFor="code" className={label}>Discount code (optional)</label>
                <input id="code" className={field} placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
                {shown?.codeMessage && <p className={`mt-2 text-[15px] ${shown.discount || shown.freeDelivery ? "text-acid" : ""}`}>{shown.codeMessage}</p>}
              </div>
              {/* honeypot: real people never see or fill this */}
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-0 w-0 opacity-0" />
              <div className="glass p-4">
                <p className="mono">PAYMENT</p>
                <p className="display mt-1 text-[18px]">Cash on delivery</p>
                <p className="mt-1 text-[16px]">Pay when it arrives. We confirm delivery details on WhatsApp.</p>
              </div>
              {error && (
                <p role="alert" className="border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 p-3 text-[16px] text-fg">
                  {error}
                </p>
              )}
            </form>
          )}

          {view === "done" && (
            <div>
              <p className="mono">ORDER #{orderId}</p>
              <p className="display mt-2 text-[26px]">
                Order placed<span className="accent">.</span>
              </p>
              <p className="body-lg mt-4 mb-6">
                Your order is in. WhatsApp should have opened with your order. Hit send there and we&apos;ll confirm delivery. Didn&apos;t open?
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
              <span className="mono">SUBTOTAL</span>
              <span className="display accent text-[28px]">{money(total)}</span>
            </div>
            <button className="btn btn-block" onClick={startCheckout}>
              CHECKOUT
            </button>
          </div>
        )}
        {view === "checkout" && (
          <div className="border-t border-white/10 px-5 py-5">
            <dl className="mb-4 space-y-1 text-[16px]">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(shown?.subtotal ?? total)}</dd></div>
              {!!shown?.discount && <div className="flex justify-between text-acid"><dt>Discount</dt><dd>−{money(shown.discount)}</dd></div>}
              {region && <div className="flex justify-between"><dt>Delivery</dt><dd>{shown ? (shown.shipping ? money(shown.shipping) : "Free") : "…"}</dd></div>}
              <div className="flex items-baseline justify-between pt-1"><dt className="mono">TOTAL</dt><dd className="display accent text-[28px]">{money(shown?.total ?? total)}</dd></div>
            </dl>
            <button type="submit" form="checkout" disabled={busy} className="btn btn-block disabled:opacity-60">
              {busy ? "PLACING ORDER…" : "PLACE ORDER"}
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
