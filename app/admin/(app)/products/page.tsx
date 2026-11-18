import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { perSachet } from "@/lib/format";
import { Card, DataTable, Empty, Money, PageHeader, PillLink } from "@/components/admin/ui";
import { Photo } from "@/components/Photo";

export const metadata = { title: "Products" };

const tone: Record<string, string> = { active: "st-delivered", draft: "st-packed", archived: "st-cancelled" };

export default async function ProductsPage() {
  const admin = await requirePerm("products.read");
  const db = getDb();
  const products = must(await db.from("products").select("*").order("sort", { ascending: true })) as Row[];
  const images = must(await db.from("product_images").select("*").order("sort", { ascending: true })) as Row[];
  const inventory = must(await db.from("inventory_items").select("*")) as Row[];

  const rows = products.map((p) => {
    const img = images.find((i) => i.product_id === p.id);
    const inv = inventory.find((i) => i.product_id === p.id);
    return { id: p.id, p, img, stock: p.kind === "bundle" ? null : (inv?.on_hand ?? 0), low: inv ? inv.on_hand <= inv.low_stock_threshold : false };
  });

  return (
    <>
      <PageHeader eyebrow="What you sell" title="Products" actions={can(admin.role, "products.write") && <PillLink href="/admin/products/new" variant="lime">+ Add product</PillLink>} />
      <Card>
        <DataTable
          rows={rows}
          href={(r) => `/admin/products/${r.id}`}
          empty={<Empty title="No products yet." hint="Add your first product, or sync them from the config in Settings." />}
          cols={[
            {
              key: "name", label: "Product", primary: true,
              render: (r) => (
                <span className="flex items-center gap-3">
                  <span className="relative block h-14 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {r.img ? <Photo src={r.img.src} alt="" sizes="64px" className="h-full w-full" /> : <span className="mono flex h-full items-center justify-center !text-[9px] !text-muted">NO IMG</span>}
                  </span>
                  <span><span className="display block text-[16px]">{r.p.name}</span><span className="block text-[13px] text-body">{r.p.descriptor}{r.p.kind === "bundle" ? " · bundle" : ""}</span></span>
                </span>
              ),
            },
            { key: "status", label: "Status", render: (r) => <span className={`status ${tone[r.p.status]}`}>{r.p.status}</span> },
            { key: "price", label: "Price", render: (r) => <Money value={Number(r.p.price)} className="text-[18px]" /> },
            { key: "per", label: "Per sachet", render: (r) => <span className="mono !text-[13px]">${perSachet(Number(r.p.price)).toFixed(2)} / SACHET</span> },
            { key: "stock", label: "Stock", render: (r) => (r.stock === null ? <span className="text-muted">from contents</span> : <span className={r.low ? "mono !text-[#ff8aa0]" : "mono !text-fg"}>{r.stock} {r.low ? "· LOW" : ""}</span>) },
          ]}
        />
      </Card>
    </>
  );
}
