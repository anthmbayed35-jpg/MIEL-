import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getDb, getEngine, must, type Row } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Latest orders for the notification bell. Admin only. */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ orders: [] }, { status: 401 });
  const db = getDb();
  const orders = must(await db.from("orders").select("*").neq("status", "draft").order("created_at", { ascending: false }).limit(8)) as Row[];
  const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const customers = ids.length ? (must(await db.from("customers").select("id, name").in("id", ids)) as Row[]) : [];
  // new ambassador applications (only for people who may see them)
  const applications = can(admin.role, "affiliates.read")
    ? (getEngine().sqlite.prepare("SELECT id, name, instagram_handle, tiktok_handle, created_at FROM affiliate_applications WHERE status = 'new' ORDER BY created_at DESC LIMIT 5").all() as { id: string; name: string; instagram_handle: string; tiktok_handle: string; created_at: string }[])
        .map((a) => ({ id: a.id, name: a.name, handle: a.instagram_handle || a.tiktok_handle, created_at: a.created_at }))
    : [];
  return NextResponse.json({
    applications,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.order_number,
      total: Number(o.total),
      customer: customers.find((c) => c.id === o.customer_id)?.name ?? "Customer",
      region: o.region,
      created_at: o.created_at,
    })),
  });
}
