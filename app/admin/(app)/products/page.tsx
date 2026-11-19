import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { perSachet } from "@/lib/format";
import { Card, DataTable, Empty, Money, PageHeader, PillLink } from "@/components/admin/ui";
import { Photo } from "@/components/Photo";
import { Pager } from "@/components/admin/Pager";
import { LIST_PAGE_SIZE } from "@/lib/lists";
import Link from "next/link";

export const metadata = { title: "Products" };

const tone: Record<string, string> = { active: "st-delivered", draft: "st-packed", archived: "st-cancelled" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const admin = await requirePerm("products.read");
  const db = getDb();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "");
  const filtered = () => {
    let f = db.from("products").select("*", { count: "exact" }).order("sort", { ascending: true }).order("created_at", { ascending: false });
    if (sp.status && ["active", "draft", "archived"].includes(sp.status)) f = f.eq("status", sp.status);
    if (q) f = f.or(`name.ilike.%${q}%,slug.ilike.%${q}%,descriptor.ilike.%${q}%`);
    return f;
  };
  const total = (await filtered().limit(1)).count ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const products = must(await filtered().range((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE - 1)) as Row[];
  // two more queries for the whole page (no per-row lookups): the photos and the stock of these products
  const ids = products.map((p) => p.id);
  const images = ids.length ? (must(await db.from("product_images").select("*").in("product_id", ids).order("sort", { ascending: true })) as Row[]) : [];
  const inventory = ids.length ? (must(await db.from("inventory_items").select("*").in("product_id", ids)) as Row[]) : [];

  const rows = products.map((p) => {
    const img = images.find((i) => i.product_id === p.id);
    const inv = inventory.find((i) => i.product_id === p.id);
    return { id: p.id, p, img, stock: p.kind === "bundle" ? null : (inv?.on_hand ?? 0), low: inv ? inv.on_hand <= inv.low_stock_threshold : false };
  });

  return (
    <>
      <PageHeader eyebrow="What you sell" title="Products" actions={can(admin.role, "products.write") && <PillLink href="/admin/products/new" variant="lime">+ Add product</PillLink>} />
      <Card>
        <form className="mb-5 grid gap-3 md:grid-cols-[2fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search name, slug or descriptor" className="a-input" aria-label="Search products" />
          <select name="status" defaultValue={sp.status ?? ""} className="a-input" aria-label="Status"><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
          <div className="flex gap-2"><button className="pill-btn pill-light">Apply</button><Link href="/admin/products" className="pill-btn pill-glass">Reset</Link></div>
        </form>
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
        <Pager basePath="/admin/products" params={{ q: sp.q, status: sp.status }} page={page} pages={pages} total={total} noun="product" />
      </Card>
    </>
  );
}
