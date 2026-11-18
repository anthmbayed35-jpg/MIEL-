import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { DEFAULT_NOTIFICATIONS, DEFAULT_POLICIES, DEFAULT_STORE } from "@/config/content";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { SETTINGS_TABS, SubNav } from "@/components/admin/SubNav";
import { saveNotifications, savePolicies, saveSecurity, saveStore, seedStoreAction } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requirePerm("settings.read");
  const db = getDb();
  const productCount = must(await db.from("products").select("id")).length;
  const rows = must(await db.from("settings").select("*")) as Row[];
  const s = (k: string) => rows.find((r) => r.key === k)?.value;
  const store = { ...DEFAULT_STORE, ...(s("store") ?? {}) };
  const notif = { ...DEFAULT_NOTIFICATIONS, ...(s("notifications") ?? {}) };
  const pol = { ...DEFAULT_POLICIES, ...(s("policies") ?? {}) };
  const security = { require_2fa: false, ...(s("security") ?? {}) } as { require_2fa: boolean };
  const owner = admin.role === "owner";

  const lock = (children: React.ReactNode) => (owner ? children : <p className="text-[14px] text-muted">Only the owner can change this.</p>);

  return (
    <>
      <PageHeader eyebrow="Store configuration" title="Settings" />
      <SubNav items={SETTINGS_TABS} role={admin.role} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Store details</SectionTitle>
          {lock(
            <ActionForm action={saveStore} className="space-y-4">
              <Field label="Store name"><input name="name" defaultValue={store.name} className="a-input" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact email"><input name="email" type="email" defaultValue={store.email} className="a-input" /></Field>
                <Field label="Contact phone"><input name="phone" defaultValue={store.phone} className="a-input" /></Field>
              </div>
              <Field label="WhatsApp number for orders" hint="Digits with country code, no +. Customers' order messages go here."><input name="whatsapp" defaultValue={store.whatsapp} inputMode="numeric" className="a-input" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Instagram handle"><input name="instagram_handle" defaultValue={store.instagram_handle} className="a-input" /></Field>
                <Field label="Instagram URL"><input name="instagram_url" defaultValue={store.instagram_url} className="a-input" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Currency"><input value="USD ($)" readOnly className="a-input opacity-70" /></Field>
                <Field label="Store timezone"><input value={store.timezone} readOnly className="a-input opacity-70" /></Field>
              </div>
              <label className="flex min-h-12 items-center gap-3 text-[16px] text-fg"><input type="checkbox" name="cod_enabled" defaultChecked={store.cod_enabled} className="h-6 w-6 accent-[#DAFC69]" />Accept orders (cash on delivery)</label>
              <p className="-mt-2 text-[13px] text-muted">Untick to pause online ordering, for example when you are out of stock or on holiday.</p>
              <SubmitButton variant="lime">Save store details</SubmitButton>
            </ActionForm>,
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle>New-order alerts</SectionTitle>
            {lock(
              <ActionForm action={saveNotifications} className="space-y-4">
                <label className="flex min-h-12 items-center gap-3 text-[16px] text-fg"><input type="checkbox" name="email_on_new_order" defaultChecked={notif.email_on_new_order} className="h-6 w-6 accent-[#DAFC69]" />Email me when an order arrives</label>
                <Field label="Email address" hint="Email needs RESEND_API_KEY set on the server (see .env.example)."><input name="email" type="email" defaultValue={notif.email} className="a-input" /></Field>
                <label className="flex min-h-12 items-center gap-3 text-[16px] text-fg"><input type="checkbox" name="whatsapp_on_new_order" defaultChecked={notif.whatsapp_on_new_order} className="h-6 w-6 accent-[#DAFC69]" />Show a &ldquo;Send to team on WhatsApp&rdquo; button on new orders</label>
                <Field label="Team WhatsApp number"><input name="whatsapp_number" defaultValue={notif.whatsapp_number} inputMode="numeric" className="a-input" /></Field>
                <p className="text-[13px] text-muted">The bell and sound in the admin always work in real time while the admin is open.</p>
                <SubmitButton variant="lime">Save</SubmitButton>
              </ActionForm>,
            )}
          </Card>

          <Card>
            <SectionTitle>Database</SectionTitle>
            <p className="mt-1 text-[16px] text-body">Products in database: {productCount}</p>
            {owner && (
              <ActionForm action={seedStoreAction} className="mt-4">
                <SubmitButton variant="glass">Sync products from config</SubmitButton>
                <p className="mt-2 text-[13px] text-muted">Adds any product from config/products.ts that is missing. Existing products are never overwritten.</p>
              </ActionForm>
            )}
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <SectionTitle>Policy pages</SectionTitle>
          <p className="mb-4 text-[14px] text-body">Plain text (blank lines make paragraphs). Published at <span className="mono">/policies/shipping</span>, <span className="mono">/returns</span>, <span className="mono">/privacy</span>, <span className="mono">/terms</span> once they have text.</p>
          {lock(
            <ActionForm action={savePolicies} className="grid gap-4 md:grid-cols-2">
              <Field label="Shipping policy"><textarea name="shipping" rows={5} defaultValue={pol.shipping} className="a-input" /></Field>
              <Field label="Returns & refunds"><textarea name="returns" rows={5} defaultValue={pol.returns} className="a-input" /></Field>
              <Field label="Privacy policy"><textarea name="privacy" rows={5} defaultValue={pol.privacy} className="a-input" /></Field>
              <Field label="Terms of service"><textarea name="terms" rows={5} defaultValue={pol.terms} className="a-input" /></Field>
              <div className="md:col-span-2"><SubmitButton variant="lime">Save policies</SubmitButton></div>
            </ActionForm>,
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Security</SectionTitle>
          {lock(
            <ActionForm action={saveSecurity} className="space-y-4">
              <label className="flex min-h-12 items-center gap-3 text-[16px] text-fg"><input type="checkbox" name="require_2fa" defaultChecked={security.require_2fa} className="h-6 w-6 accent-[#DAFC69]" />Require two-factor authentication for everyone on the team</label>
              <p className="-mt-2 text-[13px] text-muted">People without it are asked to set it up (authenticator app) the next time they open the admin. Sessions end after 12 hours of inactivity.</p>
              <SubmitButton variant="lime">Save security settings</SubmitButton>
            </ActionForm>,
          )}
        </Card>
      </div>
    </>
  );
}
