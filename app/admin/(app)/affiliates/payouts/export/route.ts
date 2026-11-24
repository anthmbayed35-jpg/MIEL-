import { can, getAdmin } from "@/lib/auth";
import { listPayouts } from "@/lib/affiliates";
import { csvCell } from "@/lib/queries";
import { localStamp } from "@/lib/time";

export const dynamic = "force-dynamic";

/** CSV of the payouts of one calendar month in the store time zone (Asia/Beirut): /admin/affiliates/payouts/export?month=2026-12 */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  if (!can(admin.role, "affiliates.read") || !can(admin.role, "exports.run")) return new Response("Forbidden", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? localStamp(new Date().toISOString()).slice(0, 7);
  let rows;
  try {
    rows = listPayouts({ month });
  } catch {
    return new Response("Pick a month like 2026-12.", { status: 400 });
  }
  const money = (c: number) => (c / 100).toFixed(2);
  const head = ["date_asia_beirut", "date_utc", "affiliate", "code", "instagram", "commissions", "corrections_deducted", "paid", "method", "note"];
  const lines = rows.map((r) =>
    [localStamp(r.paid_at), r.paid_at, r.name, r.code, r.instagram_handle ? `@${r.instagram_handle}` : "", money(r.gross_cents), money(r.corrections_cents), money(r.amount_cents), r.method, r.note].map(csvCell).join(","),
  );
  return new Response("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="affiliate-payouts-${month}.csv"`, "Cache-Control": "no-store" },
  });
}
