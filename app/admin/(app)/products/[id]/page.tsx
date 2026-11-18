import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { ArchiveBox, ImageManager } from "@/components/admin/ImageManager";
import { ProductForm } from "@/components/admin/ProductForm";
import { Flash, PageHeader, PillLink } from "@/components/admin/ui";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const admin = await requirePerm("products.read");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const product = must(await db.from("products").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!product) notFound();
  const images = must(await db.from("product_images").select("*").eq("product_id", id).order("sort", { ascending: true })) as Row[];
  const others = (must(await db.from("products").select("id, name, kind").neq("id", id)) as Row[]).filter((p) => p.kind !== "bundle");
  const canEdit = can(admin.role, "products.write");

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/products" className="underline-offset-4 hover:underline">← All products</Link> as unknown as string}
        title={product.name}
        actions={product.status === "active" ? <PillLink href={`/products/${product.slug}`} variant="glass">View on store ↗</PillLink> : undefined}
      />
      {sp.created && <Flash msg="Product created. Add images below and set its stock in Inventory." />}
      {!canEdit && <Flash error="You can view products but not change them. Ask a manager or the owner." />}
      {canEdit ? (
        <div className="space-y-5">
          <ProductForm product={product} others={others} />
          <ImageManager productId={id} images={images} canDelete={can(admin.role, "data.delete")} />
          <ArchiveBox productId={id} archived={product.status === "archived"} />
        </div>
      ) : (
        <p className="text-body">Read-only for your role.</p>
      )}
    </>
  );
}
