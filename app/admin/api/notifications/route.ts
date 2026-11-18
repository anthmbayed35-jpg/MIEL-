import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Latest orders for the notification bell. Admin only. */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ orders: [] }, { status: 401 });
  const db = getDb();
  const orders = must(await db.from("orders").select("*").neq("status", "draft").order("created_at", { ascending: false }).limit(8)) as Row[];
  const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const customers = ids.length ? (must(await db.from("customers").select("id, name").in("id", ids)) as Row[]) : [];
  return NextResponse.json({
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
