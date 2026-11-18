"use client";

import { useState } from "react";
import { createManualOrder } from "@/app/admin/(app)/orders/actions";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Money } from "./ui";

type P = { id: string; name: string; descriptor: string; price: number };
type Z = { name: string; fee: number };

/** Create an order by hand (e.g. from a WhatsApp chat) or save it as a draft. The server re-prices everything. */
export function NewOrderForm({ products, zones }: { products: P[]; zones: Z[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [region, setRegion] = useState("");
  const sub = products.reduce((n, p) => n + (qty[p.id] ?? 0) * p.price, 0);
  const fee = zones.find((z) => z.name === region)?.fee ?? 0;

  return (
    <ActionForm action={createManualOrder} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="admin-card space-y-5">
        <h2 className="text-[18px] font-semibold text-fg">Items</h2>
        <ul className="space-y-3">
          {products.map((p) => (
            <li key={p.id} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-2">
              <div>
                <p className="display text-[16px]">{p.name}</p>
                <p className="text-[13px] text-body">{p.descriptor} · ${p.price}</p>
              </div>
              <div className="flex items-center">
                <button type="button" aria-label={`Fewer ${p.name}`} onClick={() => setQty((q) => ({ ...q, [p.id]: Math.max(0, (q[p.id] ?? 0) - 1) }))} className="pill-btn pill-glass !min-w-12 !px-0">−</button>
                <input name={`qty_${p.id}`} value={qty[p.id] ?? 0} readOnly aria-label={`${p.name} quantity`} className="w-12 bg-transparent text-center text-[18px] text-fg" />
                <button type="button" aria-label={`More ${p.name}`} onClick={() => setQty((q) => ({ ...q, [p.id]: Math.min(99, (q[p.id] ?? 0) + 1) }))} className="pill-btn pill-glass !min-w-12 !px-0">+</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-white/10 pt-4">
          <span className="mono !text-body">ESTIMATE (server recalculates)</span>
          <Money value={sub + (sub ? fee : 0)} className="text-[28px] leading-none" />
        </div>
        <label className="block"><span className="a-label">Discount code (optional)</span><input name="code" className="a-input" placeholder="CODE" /></label>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="text-[18px] font-semibold text-fg">Customer & delivery</h2>
        <label className="block"><span className="a-label">Name</span><input name="name" required className="a-input" /></label>
        <label className="block"><span className="a-label">Phone</span><input name="phone" required inputMode="tel" placeholder="03 123 456 or +961 70 123 456" className="a-input" /></label>
        <label className="block"><span className="a-label">Region</span>
          <select name="region" required value={region} onChange={(e) => setRegion(e.target.value)} className="a-input">
            <option value="">Choose region</option>
            {zones.map((z) => <option key={z.name} value={z.name}>{z.name} (${z.fee})</option>)}
          </select>
        </label>
        <label className="block"><span className="a-label">Address</span><textarea name="address" required rows={3} className="a-input" /></label>
        <label className="block"><span className="a-label">Notes</span><textarea name="notes" rows={2} className="a-input" /></label>
        <label className="block"><span className="a-label">Source</span>
          <select name="source" className="a-input"><option value="whatsapp">WhatsApp</option><option value="manual">Manual / phone</option></select>
        </label>
        <div className="flex flex-wrap gap-3 pt-1">
          <SubmitButton variant="lime" name="intent" value="create">Create order</SubmitButton>
          <SubmitButton variant="glass" name="intent" value="draft">Save as draft</SubmitButton>
        </div>
        <p className="text-[13px] text-muted">Orders deduct stock immediately. Drafts don&apos;t, until you confirm them.</p>
      </div>
    </ActionForm>
  );
}
