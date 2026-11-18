import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Global search (Cmd/Ctrl+K). Admin only; results respect the role's permissions. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().replace(/[%,()]/g, "");
  if (!q) return NextResponse.json({ hits: [] });
  const db = getDb();
  const hits: { type: string; id: string; title: string; sub: string; href: string }[] = [];

  if (can(admin.role, "orders.read")) {
    const num = Number(q.replace("#", ""));
    if (Number.isInteger(num) && num > 0) {
      const orders = must(await db.from("orders").select("*").eq("order_number", num).limit(5)) as Row[];
      for (const o of orders) hits.push({ type: "order", id: o.id, title: `Order #${o.order_number}`, sub: `${o.status} · $${Number(o.total).toFixed(2)} · ${o.region}`, href: `/admin/orders/${o.id}` });
    }
  }
  if (can(admin.role, "customers.read")) {
    const customers = must(await db.from("customers").select("*").or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(6)) as Row[];
    for (const c of customers) hits.push({ type: "customer", id: c.id, title: c.name, sub: c.phone, href: `/admin/customers/${c.id}` });
  }
  if (can(admin.role, "products.read")) {
    const products = must(await db.from("products").select("*").or(`name.ilike.%${q}%,slug.ilike.%${q}%`).limit(5)) as Row[];
    for (const p of products) hits.push({ type: "product", id: p.id, title: p.name, sub: `${p.descriptor} · $${Number(p.price)}`, href: `/admin/products/${p.id}` });
  }
  return NextResponse.json({ hits });
}
