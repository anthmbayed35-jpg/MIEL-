import { can, getAdmin } from "@/lib/auth";
import { monthlyRows } from "@/lib/affiliates";
import { csvCell } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** CSV of affiliate orders and commissions for one month: /admin/affiliates/export?month=2026-12 */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (!can(admin.role, "affiliates.read") || !can(admin.role, "exports.run")) return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  let rows;
  try {
    rows = monthlyRows(month);
  } catch {
    return new Response("Pick a month like 2026-12.", { status: 400 });
  }
  const money = (c: number) => (c / 100).toFixed(2);
  const head = ["order", "date", "status", "affiliate", "code", "products_subtotal", "customer_discount", "sale_after_discount", "commission", "commission_status", "delivered_at"];
  const lines = rows.map((r) =>
    [r.order_number, r.created_at, r.status, r.affiliate, r.code, money(r.subtotal_cents), money(r.discount_amount_cents), money(r.subtotal_cents - r.discount_amount_cents), money(r.commission_amount_cents), r.commission_status, r.delivered_at].map(csvCell).join(","),
  );
  return new Response("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="affiliates-${month}.csv"`, "Cache-Control": "no-store" },
  });
}
