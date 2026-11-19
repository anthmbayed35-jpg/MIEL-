"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { trackEvent } from "@/lib/track-client";

export type CartProduct = { id: string; name: string; price: number; slug: string };
export type CartZone = { name: string; fee: number; free_over: number | null; eta: string };

type Lines = Record<string, number>; // productId -> qty

type CartCtx = {
  products: CartProduct[];
  zones: CartZone[];
  lines: Lines;
  count: number;
  total: number;
  open: boolean;
  /** An admin previewing the hidden storefront (SITE_MODE=maintenance). */
  preview: boolean;
  setOpen: (v: boolean) => void;
  add: (id: string, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "miel_cart_v1";

export function CartProvider({ products, zones, preview = false, children }: { products: CartProduct[]; zones: CartZone[]; preview?: boolean; children: React.ReactNode }) {
  const [lines, setLines] = useState<Lines>({});
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
  }, [lines, ready]);

  const add = useCallback((id: string, qty = 1) => {
    setLines((l) => ({ ...l, [id]: Math.min((l[id] ?? 0) + qty, 99) }));
    setOpen(true);
    trackEvent("add_to_cart");
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setLines((l) => {
      const next = { ...l };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, 99);
      return next;
    });
  }, []);

  const clear = useCallback(() => setLines({}), []);

  const value = useMemo<CartCtx>(() => {
    const valid = Object.entries(lines).filter(([id]) => products.some((p) => p.id === id));
    const count = valid.reduce((n, [, q]) => n + q, 0);
    const total = valid.reduce((n, [id, q]) => n + q * (products.find((p) => p.id === id)?.price ?? 0), 0);
    return { products, zones, lines, count, total, open, preview, setOpen, add, setQty, clear };
  }, [products, zones, lines, open, preview, add, setQty, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
