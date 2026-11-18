import { requirePerm } from "@/lib/auth";
import { dbMode, getDb, must } from "@/lib/db";
import { hasDemo } from "@/lib/demo";
import { Card, PageHeader, SectionTitle } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { loadDemoAction, seedStoreAction, wipeDemoAction } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requirePerm("settings.read");
  const demo = await hasDemo();
  const productCount = must(await getDb().from("products").select("id")).length;
  const owner = admin.role === "owner";
  return (
    <>
      <PageHeader eyebrow="Store configuration" title="Settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Database</SectionTitle>
          <p className="text-[16px] text-body">
            Mode: <span className="mono">{dbMode().toUpperCase()}</span>
            {dbMode() === "local" && " (local JSON file, development only)"}
          </p>
          <p className="mt-1 text-[16px] text-body">Products in database: {productCount}</p>
          {owner && (
            <ActionForm action={seedStoreAction} className="mt-4">
              <SubmitButton variant="glass">Sync products from config</SubmitButton>
              <p className="mt-2 text-[13px] text-muted">Adds any product from config/products.ts that is missing. Existing products are never overwritten.</p>
            </ActionForm>
          )}
        </Card>

        <Card>
          <div id="demo" />
          <SectionTitle>Demo data</SectionTitle>
          <p className="text-[16px] text-body">
            Fill the dashboard with ~90 days of sample orders, customers, discounts and stock so you can see how everything looks. Everything is flagged as demo and is removed (with stock restored) when you wipe it. Your real data is never touched.
          </p>
          {owner ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {!demo ? (
                <ActionForm action={loadDemoAction}>
                  <SubmitButton variant="lime">Load demo data</SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={wipeDemoAction}>
                  <SubmitButton variant="danger" confirm="Delete all demo data? Real orders and customers are not affected.">Wipe demo data</SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-muted">Only the owner can load or wipe demo data.</p>
          )}
        </Card>
      </div>
    </>
  );
}
