"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase-browser";

type Note = { id: string; number: number; total: number; customer: string; region: string; created_at: string };

const SEEN = "miel_admin_seen";
const MUTE = "miel_admin_mute";

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.42);
  } catch {}
}

/** New-order alerts: Supabase Realtime when configured, with polling as a fallback. Soft sound, mutable. */
export function NotificationBell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<Note | null>(null);
  const known = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/admin/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const { orders } = (await r.json()) as { orders: Note[] };
      setNotes(orders);
      const seen = localStorage.getItem(SEEN) ?? "";
      setUnread(orders.filter((o) => o.created_at > seen).length);
      const newest = orders[0];
      if (newest) {
        if (known.current && newest.created_at > known.current) {
          setToast(newest);
          if (!mutedRef.current) beep();
          setTimeout(() => setToast(null), 8000);
        }
        known.current = newest.created_at > (known.current ?? "") ? newest.created_at : known.current;
      } else known.current ??= new Date(0).toISOString();
    } catch {}
  }, []);

  useEffect(() => {
    const m = localStorage.getItem(MUTE) === "1";
    setMuted(m);
    mutedRef.current = m;
    load();
    const iv = setInterval(load, 15000);
    const sb = browserClient();
    const ch = sb
      ?.channel("orders-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      clearInterval(iv);
      if (sb && ch) sb.removeChannel(ch);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && notes[0]) {
      localStorage.setItem(SEEN, notes[0].created_at);
      setUnread(0);
    }
  }
  function toggleMute() {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    localStorage.setItem(MUTE, m ? "1" : "0");
  }

  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} aria-expanded={open} className="icon-btn !border-white/20 bg-black/25">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Zm4 10a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-14 z-50 w-[min(92vw,360px)] rounded-[24px] p-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="display text-[16px]">Orders</p>
            <button onClick={toggleMute} className="mono !text-body min-h-9 px-2" aria-pressed={muted}>
              {muted ? "🔇 SOUND OFF" : "🔔 SOUND ON"}
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="px-2 py-6 text-center text-[15px] text-body">No orders yet. They&apos;ll show up here.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={`/admin/orders/${n.id}`} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-white/8">
                    <span>
                      <span className="block text-[15px] font-semibold text-fg">
                        #{n.number} · {n.customer}
                      </span>
                      <span className="block text-[13px] text-body">
                        {n.region || "—"} · {new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <span className="split-num tnum text-[16px]">${n.total.toFixed(2)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toast && (
        <Link
          href={`/admin/orders/${toast.id}`}
          onClick={() => setToast(null)}
          role="status"
          className="glass-strong fixed right-4 top-24 z-[60] block w-[min(92vw,340px)] rounded-[24px] p-4 shadow-2xl"
        >
          <p className="mono">NEW ORDER</p>
          <p className="display mt-1 text-[18px]">
            #{toast.number} · ${toast.total.toFixed(2)}
          </p>
          <p className="mt-1 text-[15px] text-body">
            {toast.customer}
            {toast.region ? `, ${toast.region}` : ""}
          </p>
        </Link>
      )}
    </div>
  );
}
