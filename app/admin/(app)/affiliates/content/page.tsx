import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { listAnnouncements, listResources } from "@/lib/ambassador/admin";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Empty, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { addAnnouncementAction, addResourceAction, deleteAnnouncementAction, deleteResourceAction } from "../program/actions";

export const metadata = { title: "Ambassador content" };
export const dynamic = "force-dynamic";

/** Resources (files and links ambassadors can open) and announcements (shown in their News tab, each sends a notification). */
export default async function ContentPage() {
  const admin = await requirePerm("affiliates.read");
  const resources = listResources();
  const news = listAnnouncements();
  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Content" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Add a resource</SectionTitle>
          <ActionForm action={addResourceAction} resetOnSuccess className="space-y-4">
            <Field label="Title"><input name="title" required maxLength={100} className="a-input" /></Field>
            <Field label="Category" hint="e.g. Brand, Photos, Captions"><input name="category" maxLength={40} className="a-input" /></Field>
            <Field label="Description"><input name="description" maxLength={300} className="a-input" /></Field>
            <Field label="File (JPG, PNG, WebP or PDF, up to 12 MB)"><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="a-input" /></Field>
            <Field label="Or a link (https://)"><input name="url" type="url" maxLength={300} className="a-input" /></Field>
            <SubmitButton variant="lime">Add resource</SubmitButton>
          </ActionForm>
          <div className="mt-6 space-y-2">
            {resources.length === 0 ? <Empty title="No resources yet." /> : resources.map((r) => (
              <ActionForm key={r.id} action={deleteResourceAction} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3">
                <input type="hidden" name="id" value={r.id} />
                <span className="text-[16px] text-fg">{r.title} <span className="text-body">· {r.category || "file"}</span></span>
                <SubmitButton variant="glass" confirm={`Remove "${r.title}" from the ambassador portal?`}>Remove</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>Post an announcement</SectionTitle>
          <ActionForm action={addAnnouncementAction} resetOnSuccess className="space-y-4">
            <Field label="Title"><input name="title" required maxLength={100} className="a-input" /></Field>
            <Field label="Message"><textarea name="body" required rows={4} maxLength={1500} className="a-input" /></Field>
            <SubmitButton variant="lime" confirm="Post this and notify every ambassador?">Post</SubmitButton>
          </ActionForm>
          <div className="mt-6 space-y-2">
            {news.length === 0 ? <Empty title="No announcements yet." /> : news.map((n) => (
              <ActionForm key={n.id} action={deleteAnnouncementAction} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3">
                <input type="hidden" name="id" value={n.id} />
                <span className="text-[16px] text-fg">{n.title}</span>
                <SubmitButton variant="glass" confirm={`Delete "${n.title}"?`}>Delete</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
