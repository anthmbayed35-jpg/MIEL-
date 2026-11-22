"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isLivePage } from "@/lib/live-pages";
import { useCallback, useEffect, useRef, useState } from "react";

type App = { id: string; name: string; handle: string; created_at: string };
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

/**
 * New-order alerts over Server-Sent Events (session cookie stays httpOnly), with 30-second polling as the fallback. New orders show a toast, a badge and a soft sound that can be muted.
 */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<Note | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [appToast, setAppToast] = useState<App | null>(null);
  const known = useRef<string | null>(null);
  const knownApp = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/admin/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const { orders, applications = [] } = (await r.json()) as { orders: Note[]; applications?: App[] };
      setNotes(orders);
      setApps(applications);
      const seen = localStorage.getItem(SEEN) ?? "";
      setUnread(orders.filter((o) => o.created_at > seen).length + applications.filter((a) => a.created_at > seen).length);
      const newestApp = applications[0];
      if (newestApp) {
        if (knownApp.current && newestApp.created_at > knownApp.current) {
          setAppToast(newestApp);
          if (!mutedRef.current) beep();
          setTimeout(() => setAppToast(null), 8000);
        }
        knownApp.current = newestApp.created_at > (knownApp.current ?? "") ? newestApp.created_at : knownApp.current;
      } else knownApp.current ??= new Date(0).toISOString();
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
    // Live stream (Server-Sent Events). While it is connected there is no polling; if it drops, poll every 30 s until it
    // is back, and refetch once on every (re)connect so nothing that happened in between is missed.
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => { poll ??= setInterval(load, 30_000); };
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };
    if (typeof EventSource === "undefined") startPoll();
    else {
      es = new EventSource("/admin/api/events");
      es.addEventListener("hello", () => { stopPoll(); load(); });
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      for (const t of ["order.created", "order.status", "stock.changed", "application.created", "kpi.refresh"])
        es.addEventListener(t, () => {
          load();
          // live dashboard / order list / stock page: re-render their server data (never on edit pages, so nobody loses typing)
          if (isLivePage(pathRef.current) && !refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; router.refresh(); }, 800);
        });
      es.addEventListener("auth", () => { es?.close(); router.replace("/admin/login?expired=1"); });
      es.onerror = () => startPoll(); // the browser retries the stream by itself
    }
    return () => { es?.close(); stopPoll(); };
  }, [load, router]);

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
    const newest = [notes[0]?.created_at, apps[0]?.created_at].filter(Boolean).sort().pop();
    if (next && newest) {
      localStorage.setItem(SEEN, newest);
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
            <p className="display text-[16px]">Alerts</p>
            <button onClick={toggleMute} className="mono !text-body min-h-9 px-2" aria-pressed={muted}>
              {muted ? "🔇 SOUND OFF" : "🔔 SOUND ON"}
            </button>
          </div>
          {apps.length > 0 && (
            <ul aria-label="New applications" className="mb-2 border-b border-white/10 pb-2">
              {apps.map((a) => (
                <li key={a.id}>
                  <Link href="/admin/affiliates/applications" onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-white/8">
                    <span>
                      <span className="block text-[15px] font-semibold text-fg">New application · {a.name}</span>
                      <span className="block text-[13px] text-body">@{a.handle} · {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="mono">REVIEW</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
                        {n.region || "—"} · {new Date(n.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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

      {appToast && (
        <Link href="/admin/affiliates/applications" onClick={() => setAppToast(null)} role="status" className="glass-strong fixed right-4 top-24 z-[60] block w-[min(92vw,340px)] rounded-[24px] p-4 shadow-2xl">
          <p className="mono">NEW APPLICATION</p>
          <p className="display mt-1 text-[18px]">{appToast.name}</p>
          <p className="mt-1 text-[15px] text-body">@{appToast.handle}</p>
        </Link>
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
