"use client";

import { useRef, useState, useTransition } from "react";
import { AFFILIATE_STATUSES, AFFILIATE_TIERS, TIER_RULES } from "@/config/affiliates";
import { saveAffiliate, suggestCode } from "@/app/admin/(app)/affiliates/actions";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Field } from "./ui";

type A = {
  id: string; version: number; name: string; instagram_handle: string; phone: string; email: string; code: string; tier: string; status: string;
  payout_method: string; notes: string; commission_rate_x100: number; customer_discount_percent_x100: number;
};

/** Create / edit form. The code is uppercased as you type; "Generate" asks the server for a random free code from the name. */
export function AffiliateForm({ a, defaults }: { a?: A; defaults: { commission: number; discount: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(a?.code ?? "");
  const [hint, setHint] = useState("");
  const [pending, start] = useTransition();
  const generate = () => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const fd = new FormData();
    fd.set("name", String((form.elements.namedItem("name") as HTMLInputElement | null)?.value ?? ""));
    start(async () => {
      const r = await suggestCode(null, fd);
      if ("code" in r) {
        setCode(r.code);
        setHint("");
      } else setHint(r.error);
    });
  };
  return (
    <ActionForm action={saveAffiliate} className="space-y-4">
      {a && (
        <>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="version" value={a.version} />
        </>
      )}
      <div className="grid gap-4 md:grid-cols-2" ref={ref}>
        <Field label="Name"><input name="name" required maxLength={80} defaultValue={a?.name} className="a-input" autoComplete="off" /></Field>
        <Field label="Instagram handle"><input name="instagram_handle" maxLength={40} defaultValue={a?.instagram_handle} placeholder="rami.runs" className="a-input" autoComplete="off" /></Field>
        <Field label="Code (what their followers type)" hint={hint || "3 to 20 letters or numbers. Not case sensitive."}>
          <div className="flex gap-2">
            <input
              name="code" required minLength={3} maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="a-input uppercase" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Code"
            />
            <button type="button" onClick={generate} disabled={pending} className="pill-btn pill-glass shrink-0">{pending ? "…" : "Generate"}</button>
          </div>
        </Field>
        <Field label="Phone"><input name="phone" maxLength={30} defaultValue={a?.phone} inputMode="tel" className="a-input" /></Field>
        <Field label="Email"><input name="email" type="email" maxLength={120} defaultValue={a?.email} className="a-input" /></Field>
        <Field label="Payout method" hint="e.g. Whish money, cash, bank"><input name="payout_method" maxLength={80} defaultValue={a?.payout_method} className="a-input" /></Field>
        <Field label="Tier">
          <select name="tier" defaultValue={a?.tier ?? "seed"} className="a-input">
            {AFFILIATE_TIERS.map((t) => <option key={t} value={t}>{TIER_RULES[t].label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={a?.status ?? "active"} className="a-input">
            {AFFILIATE_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Commission (%)" hint="Of the discounted products subtotal">
          <input name="commission_percent" type="number" inputMode="decimal" step="0.01" min="0" max="100" required defaultValue={(a?.commission_rate_x100 ?? defaults.commission * 100) / 100} className="a-input" />
        </Field>
        <Field label="Customer discount (%)" hint="Off the products subtotal, not delivery">
          <input name="customer_discount_percent" type="number" inputMode="decimal" step="0.01" min="0" max="100" required defaultValue={(a?.customer_discount_percent_x100 ?? defaults.discount * 100) / 100} className="a-input" />
        </Field>
      </div>
      <Field label="Notes (private)"><textarea name="notes" rows={3} maxLength={1000} defaultValue={a?.notes} className="a-input" /></Field>
      <SubmitButton variant="lime">{a ? "Save affiliate" : "Create affiliate"}</SubmitButton>
    </ActionForm>
  );
}
