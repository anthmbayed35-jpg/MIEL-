import { saveProduct } from "@/app/admin/(app)/products/actions";
import { perSachet } from "@/lib/format";
import type { Row } from "@/lib/db";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Card, Field, SectionTitle } from "./ui";

const toLines = (arr: Row[] | null | undefined, f: (x: Row) => string) => (arr ?? []).map(f).join("\n");

/** Create / edit form. Server component: every field is a plain input posted to the saveProduct action. */
export function ProductForm({ product, others }: { product?: Row; others: Row[] }) {
  const p = product ?? { status: "draft", kind: "single", sachet_count: 12, price: 30, glow: "rgba(218,252,105,0.3)", chips: [], facts: [], how_to: [], why: [], faqs: [] };
  const bundle = (p.bundle_items ?? []) as { product_id: string; qty: number }[];
  return (
    <ActionForm action={saveProduct} className="space-y-5">
      {p.id && <input type="hidden" name="id" value={p.id} />}

      <Card>
        <SectionTitle>Basics</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title"><input name="name" required defaultValue={p.name} className="a-input" placeholder="RED BURN" /></Field>
          <Field label="Slug (URL)" hint="/products/your-slug"><input name="slug" required defaultValue={p.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="a-input" placeholder="red-burn" /></Field>
          <Field label="Descriptor"><input name="descriptor" defaultValue={p.descriptor} className="a-input" placeholder="Endurance Honey" /></Field>
          <Field label="Flavor"><input name="flavor" defaultValue={p.flavor} className="a-input" placeholder="Pomegranate + beet" /></Field>
          <Field label="Status">
            <select name="status" defaultValue={p.status} className="a-input">
              <option value="active">Active (visible in the store)</option>
              <option value="draft">Draft (hidden)</option>
              <option value="archived">Archived (hidden)</option>
            </select>
          </Field>
          <Field label="Type">
            <select name="kind" defaultValue={p.kind} className="a-input">
              <option value="single">Single pouch</option>
              <option value="bundle">Bundle (made of other products)</option>
            </select>
          </Field>
          <Field label="Description" className="md:col-span-2"><textarea name="description" rows={3} defaultValue={p.description} className="a-input" /></Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Pricing & sachets</SectionTitle>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Pouch price (USD)"><input name="price" type="number" step="0.01" min="0" required defaultValue={p.price} className="a-input" /></Field>
          <Field label="Compare-at price" hint="Optional crossed-out price"><input name="compare_at_price" type="number" step="0.01" min="0" defaultValue={p.compare_at_price ?? ""} className="a-input" /></Field>
          <Field label="Sachets per pouch"><input name="sachet_count" type="number" min="1" defaultValue={p.sachet_count} className="a-input" /></Field>
          <Field label="Sachet weight (g)"><input name="sachet_weight_g" type="number" step="0.1" min="0" defaultValue={p.sachet_weight_g ?? ""} className="a-input" /></Field>
        </div>
        <p className="mt-3 text-[14px] text-body">Per-sachet price is automatic: pouch price ÷ sachets, currently <span className="mono">${perSachet(Number(p.price) || 0).toFixed(2)}</span> at 12 sachets.</p>
      </Card>

      <Card>
        <SectionTitle>Bundle contents</SectionTitle>
        <p className="mb-3 text-[14px] text-body">Only used when Type is &ldquo;Bundle&rdquo;. Stock is taken from the products inside it (e.g. 1 of each).</p>
        <div className="grid gap-3 md:grid-cols-3">
          {others.map((o) => (
            <Field key={o.id} label={o.name}><input name={`bundle_${o.id}`} type="number" min="0" max="20" defaultValue={bundle.find((b) => b.product_id === o.id)?.qty ?? 0} className="a-input" /></Field>
          ))}
          {others.length === 0 && <p className="text-[14px] text-muted">Add single products first.</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Storefront details</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Chips (one per line)" hint="e.g. 12 SACHETS / 22G EACH / STIM-FREE"><textarea name="chips" rows={4} defaultValue={(p.chips ?? []).join("\n")} className="a-input" /></Field>
          <div className="space-y-4">
            <Field label="Card spec line"><input name="spec" defaultValue={p.spec} className="a-input" placeholder="22G · CARBS 17G · STIM-FREE" /></Field>
            <Field label="Compare-strip spec"><input name="compare_spec" defaultValue={p.compare_spec} className="a-input" /></Field>
            <Field label="Glow colour (CSS rgba)"><input name="glow" defaultValue={p.glow} className="a-input" /></Field>
          </div>
          <Field label="How to use (one step per line: Title | text)" className="md:col-span-2"><textarea name="how_to" rows={4} defaultValue={toLines(p.how_to, (x) => `${x.title} | ${x.text}`)} className="a-input" /></Field>
          <Field label="Why this one (Title | text)" className="md:col-span-2"><textarea name="why" rows={4} defaultValue={toLines(p.why, (x) => `${x.title} | ${x.text}`)} className="a-input" /></Field>
          <Field label="FAQ (Question | answer)" className="md:col-span-2"><textarea name="faqs" rows={6} defaultValue={toLines(p.faqs, (x) => `${x.q} | ${x.a}`)} className="a-input" /></Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Nutrition, ingredients & warnings</SectionTitle>
        <p className="mb-4 text-[14px] text-body">Leave a value empty (or type TBC) and the store shows a clean &ldquo;TBC&rdquo;. Nothing is invented.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nutrition facts (one per line: Label: value)" className="md:col-span-2"><textarea name="facts" rows={9} defaultValue={toLines(p.facts, (x) => `${x.label}: ${x.value ?? ""}`)} className="a-input font-mono !text-[14px]" /></Field>
          <Field label="Ingredients"><textarea name="ingredients" rows={3} defaultValue={p.ingredients ?? ""} className="a-input" /></Field>
          <Field label="Allergens"><textarea name="allergens" rows={3} defaultValue={p.allergens ?? ""} className="a-input" /></Field>
          <Field label="Warning / notice (shown near Add to cart)" className="md:col-span-2"><textarea name="warning" rows={2} defaultValue={p.warning ?? ""} className="a-input" placeholder="e.g. caffeine or creatine notice. Empty = none." /></Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Search & sharing (SEO)</SectionTitle>
        <div className="grid gap-4">
          <Field label="SEO title" hint="Leave empty to use the product name"><input name="seo_title" defaultValue={p.seo_title ?? ""} maxLength={70} className="a-input" /></Field>
          <Field label="SEO description"><textarea name="seo_description" rows={2} maxLength={170} defaultValue={p.seo_description ?? ""} className="a-input" /></Field>
        </div>
      </Card>

      <div className="sticky bottom-24 z-30 flex justify-end lg:bottom-4">
        <div className="glass-strong flex items-center gap-3 rounded-full p-2 pl-5">
          <span className="text-[14px] text-body">{p.id ? "Changes go live on the store right after saving." : "Creates the product and its stock record."}</span>
          <SubmitButton variant="lime">{p.id ? "Save product" : "Create product"}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
