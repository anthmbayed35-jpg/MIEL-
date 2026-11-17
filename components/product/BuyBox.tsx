"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/config/products";
import { money } from "@/lib/format";
import { useCart } from "../CartProvider";

/** Quantity selector + ADD TO CART, plus the mobile sticky bar (shown after the main button scrolls away). */
export function BuyBox({ product }: { product: Product }) {
  const { add, open } = useCart();
  const [qty, setQty] = useState(1);
  const [stuck, setStuck] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const total = qty * product.price;

  useEffect(() => {
    const el = btn.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addToCart = () => add(product.id, qty);

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="glass-flat flex items-center" role="group" aria-label="Quantity">
          <button
            className="flex h-14 w-14 items-center justify-center text-[28px] text-fg disabled:opacity-40"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="display w-12 text-center text-[22px]" aria-live="polite">
            {qty}
          </span>
          <button
            className="flex h-14 w-14 items-center justify-center text-[28px] text-fg disabled:opacity-40"
            onClick={() => setQty((q) => Math.min(99, q + 1))}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <p className="mono !text-body">{qty === 1 ? "1 POUCH" : `${qty} POUCHES`}</p>
      </div>

      <button ref={btn} onClick={addToCart} className="btn btn-block mt-4 !w-full">
        ADD TO CART · {money(total)}
      </button>

      {/* Mobile sticky bar. Hidden while the cart drawer is open. */}
      <div
        aria-hidden={!stuck || open}
        inert={!stuck || open}
        className={`glass-strong fixed inset-x-3 bottom-3 z-30 flex items-center gap-3 rounded-2xl p-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 motion-reduce:transition-none md:hidden ${
          stuck && !open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[130%] opacity-0"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="display truncate text-[16px]">{product.name}</p>
          <p className="mono !text-body">
            {qty} × · <span className="accent">{money(total)}</span>
          </p>
        </div>
        <button onClick={addToCart} className="btn btn-sm !min-h-12 shrink-0">
          ADD TO CART
        </button>
      </div>
    </>
  );
}

/** Yellow CTA used in the final section. Adds one pouch. */
export function AddOneButton({ product }: { product: Product }) {
  const { add } = useCart();
  return (
    <button onClick={() => add(product.id)} className="btn">
      ADD {product.name} TO CART
    </button>
  );
}
