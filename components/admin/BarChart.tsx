"use client";

import { useMemo, useRef, useState } from "react";
import type { Point, SeriesSet } from "@/lib/stats";

type Period = keyof SeriesSet;
const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function split(n: number) {
  const [w, d] = Math.abs(n).toFixed(2).split(".");
  return [Number(w).toLocaleString("en-US"), d] as const;
}
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n)));

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Thin muted bars; the hovered/selected bar turns lime and shows a tooltip bubble (value, delta chip, period). */
export function BarChart({ series, title = "Overview", fileName = "sales" }: { series: SeriesSet; title?: string; fileName?: string }) {
  const [period, setPeriod] = useState<Period>("month");
  const pts = series[period];
  const [sel, setSel] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const idx = sel ?? pts.length - 1;
  const total = useMemo(() => pts.reduce((n, p) => n + p.value, 0), [pts]);
  const max = niceMax(Math.max(...pts.map((p) => p.value)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((t) => max * t);
  const [tw, td] = split(total);
  const p = pts[idx];
  const [pw, pd] = split(p.value);

  const onMove = (e: React.PointerEvent) => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.floor(((e.clientX - r.left) / r.width) * pts.length);
    setSel(Math.max(0, Math.min(pts.length - 1, i)));
  };

  function exportCsv() {
    const csv = ["period,sales_usd", ...pts.map((x) => `"${x.tip}",${x.value.toFixed(2)}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${fileName}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pos = ((idx + 0.5) / pts.length) * 100;
  const tipShift = pos < 18 ? "0%" : pos > 82 ? "-100%" : "-50%";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[18px] text-fg">{title}</p>
          <p className="split-num tnum mt-3 text-[clamp(2rem,1.4rem+2vw,3rem)] leading-none">
            ${tw}
            <span className="text-muted">.{td}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Period" className="flex rounded-full bg-white/8 p-1">
            {PERIODS.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={period === x.id}
                onClick={() => {
                  setPeriod(x.id);
                  setSel(null);
                }}
                className={`min-h-12 rounded-full px-4 text-[14px] font-medium ${period === x.id ? "bg-fg text-black" : "text-body"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} aria-label="Export CSV" className="icon-btn !border-white/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="flex h-[220px] flex-col justify-between pb-6 text-right text-[12px] text-muted sm:h-[260px]" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className="tnum">${compact(t)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            ref={area}
            role="img"
            tabIndex={0}
            aria-label={`${title} bar chart. Use left and right arrows to inspect bars. Selected: ${p.tip}, $${p.value.toFixed(2)}`}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setSel(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setSel(Math.min(pts.length - 1, idx + 1));
              if (e.key === "ArrowLeft") setSel(Math.max(0, idx - 1));
              if (e.key === "Escape") setSel(null);
            }}
            className="relative flex h-[220px] touch-pan-y items-end gap-[3px] border-b border-white/10 pb-0 outline-offset-4 sm:h-[260px] sm:gap-1"
          >
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/6" style={{ top: `${(i / 4) * 100}%` }} />
            ))}
            {pts.map((x: Point, i) => (
              <span
                key={i}
                className="relative flex-1 rounded-t-[3px] transition-colors"
                style={{ height: `${Math.max(1.5, (x.value / max) * 100)}%`, background: i === idx ? "#DAFC69" : "rgba(207,204,196,0.28)" }}
              />
            ))}
            {/* tooltip */}
            <div className="pointer-events-none absolute z-10" style={{ left: `${pos}%`, top: `${Math.max(2, 100 - (p.value / max) * 100 - 30)}%`, transform: `translateX(${tipShift})` }}>
              <div className="relative whitespace-nowrap rounded-[18px] bg-black px-4 py-3 shadow-xl" style={{ marginLeft: tipShift === "0%" ? "0" : undefined }}>
                <div className="flex items-center gap-2">
                  <span className="split-num tnum text-[18px]">
                    ${pw}
                    <span className="text-muted">.{pd}</span>
                  </span>
                  {p.delta !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-fg px-2 py-0.5 text-[12px] font-bold" style={{ color: p.delta >= 0 ? "#16a34a" : "#e11d48" }}>
                      {p.delta >= 0 ? "↗" : "↘"} {Math.abs(p.delta).toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-body">for {p.tip}</p>
                <span
                  className="absolute -bottom-1.5 h-3 w-3 rotate-45 bg-black"
                  style={{ left: tipShift === "-50%" ? "calc(50% - 6px)" : tipShift === "0%" ? `calc(${pos}% - 6px)` : `calc(100% - ${100 - pos}% * 0 - 18px)` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-[3px] text-[11px] text-muted sm:gap-1" aria-hidden>
            {pts.map((x, i) => {
              const every = Math.ceil(pts.length / (period === "month" ? 6 : 12));
              return (
                <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                  {i % every === 0 ? x.label : ""}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title} data</caption>
        <tbody>
          {pts.map((x, i) => (
            <tr key={i}>
              <th>{x.tip}</th>
              <td>${x.value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
