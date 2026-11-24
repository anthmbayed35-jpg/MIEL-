import { can, getAdmin } from "@/lib/auth";
import { salesReport } from "@/lib/ambassador/admin";
import { csvCell } from "@/lib/queries";
import { localStamp } from "@/lib/time";

export const dynamic = "force-dynamic";

/** CSV of sales by ambassador for one month (Asia/Beirut): /admin/affiliates/reports/export?month=2026-12 */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (!can(admin.role, "affiliates.read") || !can(admin.role, "exports.run")) return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? localStamp(new Date().toISOString()).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response("Pick a month like 2026-12.", { status: 400 });
  const money = (c: number) => (c / 100).toFixed(2);
  const head = ["ambassador", "code", "orders", "sales", "discounts_given", "commission", "commission_paid", "link_visits"];
  const lines = salesReport(month).map((r) => [r.name, r.code, r.orders, money(r.sales_cents), money(r.discount_cents), money(r.commission_cents), money(r.paid_cents), r.clicks].map(csvCell).join(","));
  return new Response("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ambassador-sales-${month}.csv"`, "Cache-Control": "no-store" },
  });
}
