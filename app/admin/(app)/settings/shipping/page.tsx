import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, Field, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { SETTINGS_TABS, SubNav } from "@/components/admin/SubNav";
import { savePartner, saveZone, settlePartner } from "./actions";

export const metadata = { title: "Shipping & delivery" };

function ZoneForm({ z }: { z?: Row }) {
  return (
    <ActionForm action={saveZone} resetOnSuccess={!z} className="grid items-end gap-3 md:grid-cols-[1.3fr_100px_130px_1.3fr_auto_auto]">
      {z && <><input type="hidden" name="id" value={z.id} /><input type="hidden" name="version" value={z.version} /></>}
      <Field label="Zone"><input name="name" required defaultValue={z?.name} placeholder="Beirut" className="a-input" /></Field>
      <Field label="Fee ($)"><input name="fee" type="number" step="0.01" min="0" required defaultValue={z?.fee ?? 3} className="a-input" /></Field>
      <Field label="Free over ($)"><input name="free_over" type="number" step="0.01" min="0" defaultValue={z?.free_over ?? ""} placeholder="none" className="a-input" /></Field>
      <Field label="Estimated time"><input name="eta" defaultValue={z?.eta} placeholder="1 to 2 days" className="a-input" /></Field>
      <label className="flex min-h-12 items-center gap-2 text-[15px] text-fg"><input type="checkbox" name="active" defaultChecked={z ? z.active : true} className="h-6 w-6 accent-[#DAFC69]" />Active</label>
      <SubmitButton variant={z ? "glass" : "lime"}>{z ? "Save" : "Add zone"}</SubmitButton>
    </ActionForm>
  );
}

export default async function ShippingPage() {
  const admin = await requirePerm("shipping.manage");
  const db = getDb();
  const zones = must(await db.from("shipping_zones").select("*").order("sort", { ascending: true })) as Row[];
  const partners = must(await db.from("delivery_partners").select("*")) as Row[];
  const orders = (must(await db.from("orders").select("*")) as Row[]).filter((o) => !["draft", "cancelled", "returned"].includes(o.status));

  // COD reconciliation per partner
  const groups = [...partners.map((p) => ({ id: p.id as string | null, name: p.name as string })), { id: null as string | null, name: "Unassigned / self-delivered" }];
  const recon = groups.map((g) => {
    const mine = orders.filter((o) => (o.delivery_partner_id ?? null) === g.id && ["out_for_delivery", "delivered"].includes(o.status));
    const sum = (os: Row[]) => os.reduce((n, o) => n + Number(o.cod_amount_due), 0);
    const pending = mine.filter((o) => !o.cod_collected);
    const collected = mine.filter((o) => o.cod_collected && !o.cod_settled_at);
    const settled = mine.filter((o) => o.cod_settled_at);
    return { ...g, pending: sum(pending), pendingN: pending.length, collected: sum(collected), collectedN: collected.length, settled: sum(settled), settledN: settled.length };
  });

  return (
    <>
      <PageHeader eyebrow="Where you deliver, who delivers, and the cash" title="Shipping & delivery" />
      <SubNav items={SETTINGS_TABS} role={admin.role} />

      <Card>
        <SectionTitle>COD reconciliation</SectionTitle>
        <p className="mb-4 text-[14px] text-body"><b>Pending</b> = out for delivery or delivered, cash not collected yet. <b>Collected</b> = driver has the cash, not handed over. <b>Settled</b> = cash received by you.</p>
        <div className="grid gap-3">
          {recon.filter((r) => r.pendingN + r.collectedN + r.settledN > 0 || r.id).map((r) => (
            <div key={r.id ?? "none"} className="admin-card-flat grid items-center gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
              <p className="display text-[16px]">{r.name}</p>
              <div><p className="mono !text-muted !text-[13px]">PENDING · {r.pendingN}</p><Money value={r.pending} className="text-[22px] leading-none" /></div>
              <div><p className="mono !text-muted !text-[13px]">COLLECTED, NOT SETTLED · {r.collectedN}</p><Money value={r.collected} className="text-[22px] leading-none" /></div>
              <div><p className="mono !text-muted !text-[13px]">SETTLED · {r.settledN}</p><Money value={r.settled} className="text-[22px] leading-none" /></div>
              <ActionForm action={settlePartner}>
                <input type="hidden" name="partner" value={r.id ?? ""} />
                <SubmitButton variant="lime" confirm={`Mark ${r.collectedN} collected orders ($${r.collected.toFixed(2)}) as settled?`} className={r.collectedN ? "" : "opacity-40"}>Settle</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-5">
        <SectionTitle>Delivery zones (Lebanon)</SectionTitle>
        <p className="mb-4 text-[14px] text-body">Fees apply at checkout. &ldquo;Free over&rdquo; gives free delivery above that order value. The fees below are starting placeholders, so set your real ones.</p>
        <div className="space-y-4">
          {zones.map((z) => <ZoneForm key={z.id} z={z} />)}
        </div>
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="a-label">Add a zone</p>
          <ZoneForm />
        </div>
      </Card>

      <Card className="mt-5">
        <SectionTitle>Delivery partners</SectionTitle>
        <div className="space-y-4">
          {partners.map((p) => (
            <ActionForm key={p.id} action={savePartner} className="grid items-end gap-3 md:grid-cols-[1.2fr_1fr_1.5fr_auto_auto]">
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="version" value={p.version} />
              <Field label="Name"><input name="name" required defaultValue={p.name} className="a-input" /></Field>
              <Field label="Phone"><input name="phone" defaultValue={p.phone} className="a-input" /></Field>
              <Field label="Notes"><input name="notes" defaultValue={p.notes} className="a-input" /></Field>
              <label className="flex min-h-12 items-center gap-2 text-[15px] text-fg"><input type="checkbox" name="active" defaultChecked={p.active} className="h-6 w-6 accent-[#DAFC69]" />Active</label>
              <SubmitButton variant="glass">Save</SubmitButton>
            </ActionForm>
          ))}
        </div>
        <ActionForm action={savePartner} resetOnSuccess className="mt-6 grid items-end gap-3 border-t border-white/10 pt-5 md:grid-cols-[1.2fr_1fr_1.5fr_auto_auto]">
          <Field label="New partner"><input name="name" required placeholder="Courier name" className="a-input" /></Field>
          <Field label="Phone"><input name="phone" className="a-input" /></Field>
          <Field label="Notes"><input name="notes" className="a-input" /></Field>
          <label className="flex min-h-12 items-center gap-2 text-[15px] text-fg"><input type="checkbox" name="active" defaultChecked className="h-6 w-6 accent-[#DAFC69]" />Active</label>
          <SubmitButton variant="lime">Add partner</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
