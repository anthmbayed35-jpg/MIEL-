"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { copy } from "@/config/copy";
import { money } from "@/lib/format";
import { useCart } from "./CartProvider";

/**
 * JOB: keep buying one tap on a phone once the lineup has scrolled away. A 52px bar at the bottom: a flavour picker and ADD TO CART with
 * the price. It appears after #shop has scrolled above the screen, hides again at the footer and while the cart is open. Phones only.
 */
export function MiniCartBar() {
  const { products, add, open } = useCart();
  const list = products.filter((p) => !p.soldOut);
  const [pick, setPick] = useState(list[0]?.id ?? "");
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const shop = document.getElementById("shop");
        const foot = document.querySelector("footer");
        const past = !!shop && shop.getBoundingClientRect().bottom < 0;
        const atFooter = !!foot && foot.getBoundingClientRect().top < window.innerHeight - 60;
        setShow(past && !atFooter);
      });
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const cur = list.find((p) => p.id === pick) ?? list[0];
  if (!mounted || !cur) return null;
  const m = copy().miniBar;
  const visible = show && !open;
  return createPortal(
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`glass-strong !bg-[rgba(35,32,28,0.92)] fixed inset-x-2 bottom-2 z-30 flex h-[52px] items-center gap-2 rounded-2xl p-0.5 pb-[env(safe-area-inset-bottom)] transition-[transform,opacity] duration-300 motion-reduce:transition-none md:hidden ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[140%] opacity-0"}`}
    >
      <select aria-label={m.choose} value={cur.id} onChange={(e) => setPick(e.target.value)} className="display h-12 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-[15px] text-fg">
        {list.map((p) => (
          <option key={p.id} value={p.id} className="bg-bg text-fg">{p.name} · {money(p.price)}</option>
        ))}
      </select>
      <button type="button" onClick={() => add(cur.id)} className="btn btn-sm !min-h-12 shrink-0 !px-4">
        {m.add}
      </button>
    </div>,
    document.body,
  );
}
