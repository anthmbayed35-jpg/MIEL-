import type { ReactNode } from "react";

export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" });

export function Stat({ label, value, accent, sub }: { label: string; value: ReactNode; accent?: boolean; sub?: string }) {
  return (
    <div className="glass-flat rounded-[20px] p-4 md:p-5">
      <p className="mono mb-2">{label}</p>
      <p className={`display text-[28px] leading-none md:text-[34px] ${accent ? "accent" : ""}`}>{value}</p>
      {sub && <p className="mt-2 text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

export function PageTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mono mb-2">{kicker}</p>
      <h1 className="display h-section">{title}</h1>
      {children && <div className="body-lg mt-3">{children}</div>}
    </div>
  );
}

const COMMISSION_STYLE: Record<string, string> = { pending: "st-packed", approved: "st-confirmed", paid: "st-delivered", void: "st-cancelled", requested: "st-packed", submitted: "st-packed", rejected: "st-cancelled", shipped: "st-out_for_delivery", delivered: "st-delivered" };
export function Pill({ value }: { value: string }) {
  return <span className={`status ${COMMISSION_STYLE[value] ?? "st-new"}`}>{value.replace(/_/g, " ")}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass p-5 md:p-6 ${className}`}>{children}</section>;
}
