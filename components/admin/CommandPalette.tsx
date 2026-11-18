"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { type: "order" | "customer" | "product"; id: string; title: string; sub: string; href: string };

/** Cmd/Ctrl+K global search: orders by number, customers by name/phone, products. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("admin:search", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("admin:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/admin/api/search?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          setHits((await r.json()).hits);
          setI(0);
        }
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;
  const go = (h?: Hit) => {
    if (!h) return;
    setOpen(false);
    router.push(h.href);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button className="scrim absolute inset-0" aria-label="Close search" onClick={() => setOpen(false)} />
      <div className="glass-strong relative w-full max-w-xl rounded-[28px] p-3">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === "Enter") go(hits[i]);
          }}
          placeholder="Search orders (#1042), customers, products…"
          className="a-input !min-h-14 !rounded-2xl !text-[18px]"
          aria-label="Search"
        />
        <ul className="mt-2 max-h-[50vh] overflow-y-auto">
          {q && hits.length === 0 && <li className="px-3 py-6 text-center text-[15px] text-body">No matches. Try an order number, a name or a phone number.</li>}
          {hits.map((h, n) => (
            <li key={h.type + h.id}>
              <button onClick={() => go(h)} onMouseEnter={() => setI(n)} className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-3 text-left ${n === i ? "bg-white/12" : ""}`}>
                <span>
                  <span className="block text-[16px] font-semibold text-fg">{h.title}</span>
                  <span className="block text-[13px] text-body">{h.sub}</span>
                </span>
                <span className="mono !text-[11px]">{h.type}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mono !text-muted px-3 pb-1 pt-2 !text-[11px]">↑↓ to move · ENTER to open · ESC to close</p>
      </div>
    </div>
  );
}
