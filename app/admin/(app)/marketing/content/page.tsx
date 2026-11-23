import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { versionIn } from "@/lib/versioned";
import { DEFAULT_ANNOUNCEMENT, DEFAULT_FAQ, DEFAULT_HERO } from "@/config/content";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { MARKETING_TABS, SubNav } from "@/components/admin/SubNav";
import { addTestimonial, saveAnnouncement, saveFaq, saveHero, setTestimonial } from "../actions";

export const metadata = { title: "Content" };

export default async function ContentPage() {
  const admin = await requirePerm("content.manage");
  const rows = must(await getDb().from("pages_content").select("*")) as Row[];
  const c = (k: string) => rows.find((r) => r.key === k)?.value;
  const ann = { ...DEFAULT_ANNOUNCEMENT, ...(c("announcement") ?? {}) };
  const hero = { ...DEFAULT_HERO, ...(c("hero") ?? {}) };
  const faq = (c("faq") ?? DEFAULT_FAQ) as { q: string; a: string }[];
  const tests = (c("testimonials") ?? []) as Row[];

  return (
    <>
      <PageHeader eyebrow="Edit the store without code" title="Content" />
      <SubNav items={MARKETING_TABS} role={admin.role} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Announcement bar</SectionTitle>
          <ActionForm action={saveAnnouncement} className="space-y-4">
            <input type="hidden" name="version" value={versionIn(rows as never, "announcement")} />
            <label className="flex min-h-12 items-center gap-3 text-[16px] text-fg"><input type="checkbox" name="enabled" defaultChecked={ann.enabled} className="h-6 w-6 accent-[#DAFC69]" /> Show the bar at the top of the store</label>
            <Field label="Text"><input name="text" defaultValue={ann.text} maxLength={160} className="a-input" /></Field>
            <Field label="Link (optional)"><input name="link" defaultValue={ann.link} placeholder="/#lineup" className="a-input" /></Field>
            <SubmitButton variant="lime">Save</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <SectionTitle>Home hero text</SectionTitle>
          <ActionForm action={saveHero} className="space-y-4">
            <input type="hidden" name="version" value={versionIn(rows as never, "hero")} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Headline, line 1"><input name="headline1" defaultValue={hero.headline1} maxLength={40} className="a-input" /></Field>
              <Field label="Line 2 (yellow)"><input name="headline2" defaultValue={hero.headline2} maxLength={40} className="a-input" /></Field>
            </div>
            <Field label="Subhead"><textarea name="sub" rows={2} defaultValue={hero.sub} maxLength={200} className="a-input" /></Field>
            <SubmitButton variant="lime">Save</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Home page FAQ</SectionTitle>
          <ActionForm action={saveFaq} className="space-y-4">
            <input type="hidden" name="version" value={versionIn(rows as never, "faq")} />
            <Field label="One per line: Question | Answer"><textarea name="faq" rows={9} defaultValue={faq.map((f) => `${f.q} | ${f.a}`).join("\n")} className="a-input" /></Field>
            <SubmitButton variant="lime">Save FAQ</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Reviews & testimonials</SectionTitle>
          <p className="mb-4 text-[14px] text-body">Only approved ones appear on the store. Add a quote (with the customer&apos;s permission), then approve it.</p>
          <ul className="space-y-3">
            {tests.map((t) => (
              <li key={t.id} className="admin-card-flat flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-fg">&ldquo;{t.text}&rdquo;</p>
                  <p className="mt-1 text-[13px] text-body">{t.name} · {"★".repeat(t.rating)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`status ${t.approved ? "st-delivered" : "st-packed"}`}>{t.approved ? "Approved" : "Pending"}</span>
                  <ActionForm action={setTestimonial} className="flex gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton variant={t.approved ? "glass" : "lime"} name="act" value={t.approved ? "hide" : "approve"} className="!min-h-12 md:!min-h-10">{t.approved ? "Hide" : "Approve"}</SubmitButton>
                    {can(admin.role, "data.delete") && <SubmitButton variant="danger" name="act" value="remove" confirm="Remove this testimonial?" className="!min-h-12 md:!min-h-10">Remove</SubmitButton>}
                  </ActionForm>
                </div>
              </li>
            ))}
            {tests.length === 0 && <li className="text-[15px] text-body">No testimonials yet.</li>}
          </ul>
          <ActionForm action={addTestimonial} resetOnSuccess className="mt-5 grid gap-3 md:grid-cols-[1fr_2fr_100px_auto] md:items-end">
            <Field label="Name"><input name="name" required className="a-input" /></Field>
            <Field label="Quote"><input name="text" required maxLength={400} className="a-input" /></Field>
            <Field label="Stars"><select name="rating" defaultValue="5" className="a-input">{[5, 4, 3].map((n) => <option key={n}>{n}</option>)}</select></Field>
            <SubmitButton variant="glass">Add</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
