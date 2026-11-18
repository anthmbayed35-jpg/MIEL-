import { can, getAdmin } from "@/lib/auth";
import { customersWithStats } from "@/lib/customers";
import { csvCell } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdmin();
  if (!admin || !can(admin.role, "customers.read")) return new Response("Forbidden", { status: 403 });
  const list = await customersWithStats();
  const rows = list.map((c) => [c.name, c.phone, c.email, c.orders, c.spent, c.last, (c.tags as string[]).join(" "), c.blocked ? "yes" : "no", c.created_at].map(csvCell).join(","));
  return new Response("﻿" + ["name,phone,email,orders,total_spent,last_order,tags,blocked,created", ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
