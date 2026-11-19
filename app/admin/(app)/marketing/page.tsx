import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { abandonedMessage } from "@/lib/messages";
import { waLink } from "@/lib/phone";
import { isSale } from "@/lib/stats";
import { DEFAULT_TRACKING } from "@/config/content";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, DataTable, Empty, Field, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { MARKETING_TABS, SubNav } from "@/components/admin/SubNav";
import { markContacted, saveTracking } from "./actions";

export const metadata = { title: "Marketing" };

const ago = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 3_600_000));
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function MarketingPage() {
  const admin = await requirePerm("marketing.manage");
  const db = getDb();
  const abandoned = (must(await db.from("abandoned_checkouts").select("*").eq("recovered", false).order("created_at", { ascending: false }).limit(30)) as Row[]);
  const orders = (must(await db.from("orders").select("*")) as Row[]).filter(isSale);
  const tracking = { ...DEFAULT_TRACKING, ...((must(await db.from("settings").select("*").eq("key", "tracking")) as Row[])[0]?.value ?? {}) };

  const src = new Map<string, { source: string; orders: number; revenue: number }>();
  for (const o of orders) {
    const k = (o.utm_source as string) || "Direct / unknown";
    const e = src.get(k) ?? { source: k, orders: 0, revenue: 0 };
    e.orders++;
    e.revenue += Number(o.total);
    src.set(k, e);
  }
  const sources = [...src.values()].sort((a, b) => b.revenue - a.revenue).map((s) => ({ id: s.source, ...s }));
  const total = sources.reduce((n, s) => n + s.revenue, 0) || 1;

  return (
    <>
      <PageHeader eyebrow="Win customers back and see where they come from" title="Marketing" />
      <SubNav items={MARKETING_TABS} role={admin.role} />

      <Card>
        <SectionTitle>Abandoned checkouts</SectionTitle>
        <p className="mb-4 text-[14px] text-body">People who entered their name and phone at checkout but didn&apos;t finish. One tap opens WhatsApp with a message ready to send.</p>
        <DataTable
          rows={abandoned}
          empty={<Empty title="No abandoned checkouts." hint="When someone starts checkout and leaves, they show up here." />}
          cols={[
            { key: "n", label: "Customer", primary: true, render: (a) => <span>{a.name || "Unknown"}<span className="mono !text-body ml-2 !text-[12px]">{a.phone}</span></span> },
            { key: "i", label: "Cart", render: (a) => (a.items as Row[]).map((i) => `${i.qty}× ${i.name}`).join(", ") },
            { key: "t", label: "Value", render: (a) => <Money value={Number(a.total)} className="text-[18px]" /> },
            { key: "w", label: "When", render: (a) => ago(a.created_at) },
            {
              key: "a", label: "Recover",
              render: (a) => (
                <span className="flex flex-wrap items-center gap-2">
                  <a href={waLink(a.phone, abandonedMessage(a.name, (a.items as Row[]).map((i) => `${i.qty}× ${i.name}`).join(", ")))} target="_blank" rel="noopener noreferrer" className="pill-btn pill-lime !min-h-12 md:!min-h-10">WhatsApp</a>
                  {a.contacted_at ? <span className="status st-delivered">Contacted</span> : (
                    <ActionForm action={markContacted}><input type="hidden" name="id" value={a.id} /><SubmitButton variant="glass" className="!min-h-12 md:!min-h-10">Mark contacted</SubmitButton></ActionForm>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Traffic sources (from UTM on orders)</SectionTitle>
          {sources.length === 0 ? <p className="text-[15px] text-body">No orders yet. Tag your links with <span className="mono">?utm_source=instagram</span> to see where orders come from.</p> : (
            <ul className="space-y-4">
              {sources.map((s) => (
                <li key={s.id}>
                  <div className="flex items-baseline justify-between gap-2"><span className="text-[16px] capitalize text-fg">{s.source}</span><span className="text-[13px] text-body">{s.orders} orders · <Money value={s.revenue} className="text-[15px]" decimals={false} /></span></div>
                  <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-acid" style={{ width: `${(s.revenue / total) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Pixel & analytics IDs</SectionTitle>
          <p className="mb-4 text-[14px] text-body">Paste your IDs and they are added to every storefront page. Leave empty to turn off.</p>
          <ActionForm action={saveTracking} className="space-y-4">
            <Field label="Meta Pixel ID" hint="Numbers only"><input name="meta_pixel_id" defaultValue={tracking.meta_pixel_id} inputMode="numeric" placeholder="123456789012345" className="a-input" /></Field>
            <Field label="Google Analytics 4 ID" hint="Looks like G-XXXXXXXXXX"><input name="ga4_id" defaultValue={tracking.ga4_id} placeholder="G-XXXXXXXXXX" className="a-input" /></Field>
            <SubmitButton variant="lime">Save IDs</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
