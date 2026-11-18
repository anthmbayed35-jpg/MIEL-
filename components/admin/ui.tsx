import Link from "next/link";
import { STATUS_LABEL, type OrderStatus } from "@/lib/status";

/* Shared admin building blocks. New admin pages must reuse these (Card, Money, Delta, StatusBadge, DataTable, Field). */

export function Card({ children, className = "", flat = false, as: Tag = "div" }: { children: React.ReactNode; className?: string; flat?: boolean; as?: "div" | "section" | "li" }) {
  const T = Tag as React.ElementType;
  return <T className={`${flat ? "admin-card-flat p-5" : "admin-card"} ${className}`}>{children}</T>;
}

/** Split-tone money: whole part in off-white, decimals muted. e.g. $1,842.56 */
export function Money({ value, className = "text-[40px] leading-none", decimals = true }: { value: number; className?: string; decimals?: boolean }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const [whole, dec] = abs.toFixed(2).split(".");
  const w = Number(whole).toLocaleString("en-US");
  return (
    <span className={`split-num tnum ${className}`}>
      {neg ? "−" : ""}${w}
      {decimals && <span className="text-muted">.{dec}</span>}
    </span>
  );
}

/** Plain count with the same typography (non-money KPI) */
export function Num({ value, className = "text-[40px] leading-none" }: { value: number | string; className?: string }) {
  return <span className={`split-num tnum ${className}`}>{typeof value === "number" ? value.toLocaleString("en-US") : value}</span>;
}

export function Delta({ value, caption = "from last period", compact = false }: { value: number | null; caption?: string; compact?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-[13px] text-muted">No prior data</span>;
  const up = value >= 0;
  const c = up ? "#4ADE80" : "#FF5C7A";
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-body">
      <span className="inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 font-semibold" style={{ color: c, background: `${c}22` }}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={up ? "" : "rotate-90"}>
          <path d="M2 8 8 2M3.5 2H8v4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {Math.abs(value).toFixed(2)}%
        <span className="sr-only">{up ? "up" : "down"}</span>
      </span>
      {!compact && caption}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus | string }) {
  const label = STATUS_LABEL[status as OrderStatus] ?? status;
  return <span className={`status st-${status}`}>{label}</span>;
}

export function PayBadge({ collected, refunded }: { collected: boolean; refunded?: boolean }) {
  if (refunded) return <span className="status st-returned">Refunded</span>;
  return collected ? <span className="status st-delivered">COD collected</span> : <span className="status st-packed">COD pending</span>;
}

/** Page title with the short gradient band behind it. */
export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="relative pb-6 pt-2 md:pb-8">
      <div className="admin-band admin-band-short" aria-hidden />
      {eyebrow && <p className="mb-2 text-[15px] text-body">{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(1.75rem,1.2rem+2.4vw,3rem)]">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-semibold text-fg">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="display text-[20px]">{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-md text-[16px] text-body">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="admin-card-flat border-[#FF5C7A]/40 p-5 text-[16px]">
      <p className="display text-[18px]">Something broke.</p>
      <p className="mt-1 text-body">{message}</p>
    </div>
  );
}

export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="a-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="mono !text-body">{k}</dt>
      <dd className="text-right text-[15px] text-fg">{children}</dd>
    </div>
  );
}

/** Responsive table: a real table from md up, stacked cards on phones. Each column provides a `label` for the mobile card. */
export type Col<T> = { key: string; label: string; render: (row: T) => React.ReactNode; className?: string; primary?: boolean; noLink?: boolean };
export function DataTable<T extends Record<string, any>>({ rows, cols, href, empty }: { rows: T[]; cols: Col<T>[]; href?: (row: T) => string; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty ?? <Empty title="Nothing here yet." />}</>;
  const linkKey = cols.find((c) => !c.noLink)?.key;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="a-table">
          <thead>
            <tr>{cols.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                {cols.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.key === linkKey && href ? (
                      <Link href={href(r)} className="font-semibold text-fg underline-offset-4 hover:underline focus-visible:underline">
                        {c.render(r)}
                      </Link>
                    ) : (
                      c.render(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => {
          const inner = (
            <div className="admin-card-flat space-y-2 p-4">
              {cols.map((c) => (
                <div key={c.key} className={c.primary ? "text-[17px] font-semibold text-fg" : "flex items-center justify-between gap-3 text-[15px]"}>
                  {!c.primary && <span className="mono !text-muted !text-[11px]">{c.label}</span>}
                  <span className={c.primary ? "" : "text-right"}>{c.render(r)}</span>
                </div>
              ))}
            </div>
          );
          return <li key={String(r.id)}>{href ? <Link href={href(r)} className="block rounded-[20px]">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </>
  );
}

export function PillLink({ href, children, variant = "glass", className = "" }: { href: string; children: React.ReactNode; variant?: "light" | "lime" | "glass"; className?: string }) {
  return (
    <Link href={href} className={`pill-btn pill-${variant} ${className}`}>
      {children}
    </Link>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mb-4 rounded-2xl border px-4 py-3 text-[15px] ${error ? "border-[#FF5C7A]/50 bg-[#FF5C7A]/10" : "border-acid/40 bg-acid/10"}`}>
      {error ?? msg}
    </p>
  );
}
