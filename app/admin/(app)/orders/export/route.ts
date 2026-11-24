import { getAdmin, can } from "@/lib/auth";
import { csvCell, listOrders } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** CSV export of the currently filtered orders. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (!can(admin.role, "exports.run")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { orders } = await listOrders(sp, false);
  const head = ["order", "date", "status", "customer", "phone", "region", "address", "subtotal", "discount", "shipping", "total", "cod_collected", "tracking", "source", "utm_source", "code", "affiliate", "affiliate_code", "affiliate_discount", "commission", "commission_status"];
  const rows = orders.map((o) =>
    [o.order_number, o.created_at, o.status, o.customer?.name, o.customer?.phone, o.region, o.address, o.subtotal, o.discount_total, o.shipping_fee, o.total, o.cod_collected ? "yes" : "no", o.tracking_number, o.source, o.utm_source, o.discount_code, o.affiliate?.name, o.affiliate?.code, o.affiliate ? Number(o.discount_amount) : "", o.affiliate ? Number(o.commission_amount) : "", o.commission_status].map(csvCell).join(","),
  );
  return new Response("﻿" + [head.join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
