import { can, getAdmin } from "@/lib/auth";
import { analytics } from "@/lib/analytics";
import { csvCell } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** CSV exports for the analytics tables. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || !can(admin.role, "analytics.read")) return new Response("Forbidden", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "sales";
  const a = await analytics();
  let head: string[] = [];
  let rows: unknown[][] = [];
  if (kind === "products") { head = ["product", "pouches", "revenue_usd"]; rows = a.products.map((p) => [p.product, p.qty, p.revenue]); }
  else if (kind === "regions") { head = ["region", "orders", "revenue_usd"]; rows = a.regions.map((r) => [r.region, r.orders, r.revenue]); }
  else if (kind === "discounts") { head = ["code", "orders", "discount_given_usd", "revenue_usd"]; rows = a.discounts.map((d) => [d.code, d.orders, d.discount, d.revenue]); }
  else if (kind === "funnel") { head = ["step", "unique_sessions"]; rows = a.funnel.map((f) => [f.step, f.count]); }
  else { head = ["date", "sales_usd"]; rows = a.series.month.map((p) => [p.tip, p.value]); }
  const csv = "﻿" + [head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="analytics-${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
