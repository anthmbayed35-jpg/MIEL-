import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Add product" };

export default async function NewProduct() {
  await requirePerm("products.write");
  const others = (must(await getDb().from("products").select("id, name, kind")) as Row[]).filter((p) => p.kind !== "bundle");
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/products" className="underline-offset-4 hover:underline">← All products</Link> as unknown as string} title="Add product" />
      <ProductForm others={others} />
    </>
  );
}
