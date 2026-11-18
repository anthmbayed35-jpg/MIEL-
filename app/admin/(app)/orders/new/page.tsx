import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { NewOrderForm } from "@/components/admin/NewOrderForm";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  await requirePerm("orders.write");
  const db = getDb();
  const products = must(await db.from("products").select("*").eq("status", "active").order("sort", { ascending: true })) as Row[];
  const zones = must(await db.from("shipping_zones").select("*").eq("active", true).order("sort", { ascending: true })) as Row[];
  return (
    <>
      <PageHeader eyebrow="For WhatsApp chats and phone orders" title="New order" />
      <NewOrderForm
        products={products.map((p) => ({ id: p.id, name: p.name, descriptor: p.descriptor, price: Number(p.price) }))}
        zones={zones.map((z) => ({ name: z.name, fee: Number(z.fee) }))}
      />
    </>
  );
}
