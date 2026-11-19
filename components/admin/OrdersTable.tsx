"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkStatus } from "@/app/admin/(app)/orders/actions";
import { ORDER_STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/status";
import { DataTable, Money, PayBadge, StatusBadge, Empty, type Col } from "./ui";

export type OrderRow = {
  id: string;
  number: number;
  date: string;
  customer: string;
  phone: string;
  region: string;
  total: number;
  status: string;
  collected: boolean;
  source: string;
  test?: boolean;
};

/** Orders list with row selection and bulk actions (change status, print slips). */
export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [to, setTo] = useState<OrderStatus>("confirmed");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const all = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const cols: Col<OrderRow>[] = [
    { key: "num", label: "Order", render: (r) => <span className="mono !text-[14px] !text-fg">#{r.number}{r.test && <span className="status st-cancelled ml-2">TEST</span>}</span>, primary: true },
    { key: "date", label: "Date", render: (r) => new Date(r.date).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
    { key: "cust", label: "Customer", render: (r) => <span><span className="block text-fg">{r.customer}</span><span className="block text-[13px] text-muted">{r.phone}</span></span> },
    { key: "region", label: "Region", render: (r) => r.region || "—" },
    { key: "total", label: "Total", render: (r) => <Money value={r.total} className="text-[18px]" />, className: "tnum" },
    { key: "pay", label: "Payment", render: (r) => (["cancelled", "draft"].includes(r.status) ? <span className="text-muted">—</span> : <PayBadge collected={r.collected} refunded={r.status === "returned" && r.collected} />) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "sel", label: "Select", noLink: true, className: "w-12",
      render: (r) => (
        <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select order ${r.number}`} className="h-6 w-6 accent-[#DAFC69]" />
      ),
    },
  ];

  return (
    <div>
      {sel.size > 0 && (
        <div className="admin-card-flat mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="mono !text-fg px-2">{sel.size} SELECTED</span>
          <select value={to} onChange={(e) => setTo(e.target.value as OrderStatus)} className="a-input !w-auto" aria-label="New status">
            {ORDER_STATUSES.filter((s) => s !== "cancelled" && s !== "draft").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button
            disabled={pending}
            onClick={() => start(async () => { setMsg(await bulkStatus([...sel], to)); setSel(new Set()); })}
            className="pill-btn pill-lime"
          >
            {pending ? "Working…" : "Change status"}
          </button>
          <Link href={`/admin/print?type=packing&ids=${[...sel].join(",")}`} target="_blank" className="pill-btn pill-glass">Print packing slips</Link>
          <Link href={`/admin/print?type=invoice&ids=${[...sel].join(",")}`} target="_blank" className="pill-btn pill-glass">Print invoices</Link>
          <button onClick={() => setSel(new Set())} className="pill-btn pill-glass">Clear</button>
        </div>
      )}
      {msg && <p role="status" className={`mb-4 rounded-2xl border px-4 py-3 text-[15px] ${msg.error ? "border-[#FF5C7A]/50 bg-[#FF5C7A]/10" : "border-acid/40 bg-acid/10"}`}>{msg.error ?? msg.ok}</p>}
      {rows.length > 0 && (
        <label className="mb-3 flex min-h-10 w-fit items-center gap-3 px-1 text-[14px] text-body">
          <input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="h-6 w-6 accent-[#DAFC69]" />
          Select all on this page
        </label>
      )}
      <DataTable rows={rows} cols={cols} href={(r) => `/admin/orders/${r.id}`} empty={<Empty title="No orders match." hint="Try clearing a filter, or create an order by hand." />} />
    </div>
  );
}
