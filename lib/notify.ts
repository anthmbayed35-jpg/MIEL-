import "server-only";
import { DEFAULT_NOTIFICATIONS } from "@/config/content";
import { getDb, usesDb, type Row } from "./db";

/**
 * Optional email alert for new orders via Resend (https://resend.com). Needs RESEND_API_KEY and NOTIFY_FROM
 * (a verified sender, e.g. "MIEL+ <orders@yourdomain.com>"). Silently does nothing if they aren't set.
 * Never throws: a failed email must not fail the customer's order.
 */
export async function notifyNewOrder(o: { number: number; total: number; customer: string; phone: string; region: string; lines: { name: string; qty: number }[] }) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.NOTIFY_FROM || !usesDb()) return;
    const row = ((await getDb().from("settings").select("*").eq("key", "notifications")) as { data: Row[] }).data?.[0];
    const n = { ...DEFAULT_NOTIFICATIONS, ...(row?.value ?? {}) };
    if (!n.email_on_new_order || !n.email) return;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM,
        to: [n.email],
        subject: `New MIEL+ order #${o.number} · $${o.total.toFixed(2)}`,
        text: `${o.customer} (${o.phone}), ${o.region}\n${o.lines.map((l) => `${l.qty} x ${l.name}`).join("\n")}\nTotal: $${o.total.toFixed(2)} (cash on delivery)`,
      }),
    });
  } catch {}
}
