import "server-only";
import { DEFAULT_NOTIFICATIONS } from "@/config/content";
import { getDb, type Row } from "./db";
import { mailConfigured, sendMail } from "./mail";
import { orderRef } from "./order-ref";

/**
 * Email alert to the store for each new order, through the mail adapter (lib/mail.ts), when the owner enabled it in
 * Settings > New-order alerts. Never throws: a failed email must not fail the customer's order, but the failure is
 * logged for the operator. Missing mail configuration in production is refused at startup (lib/env.ts).
 */
export async function notifyNewOrder(o: { number: number; total: number; customer: string; phone: string; region: string; lines: { name: string; qty: number }[] }) {
  try {
    const row = ((await getDb().from("settings").select("*").eq("key", "notifications")) as { data: Row[] }).data?.[0];
    const n = { ...DEFAULT_NOTIFICATIONS, ...(row?.value ?? {}) };
    if (!n.email_on_new_order || !n.email) return;
    await sendMail({
      to: n.email,
      subject: `New MIEL+ order ${orderRef(o.number)} · ${o.total.toFixed(2)}`,
      text: `${o.customer} (${o.phone}), ${o.region}\n${o.lines.map((l) => `${l.qty} x ${l.name}`).join("\n")}\nTotal: $${o.total.toFixed(2)} (cash on delivery)`,
    });
  } catch (e) {
    console.error("new-order email failed:", (e as Error).message);
  }
}

/** Order confirmation to the customer. Skipped silently (no error, no log noise) when the customer gave no email or mail is not configured. */
export async function notifyCustomerOrder(o: { email?: string | null; number: number; total: number; name: string; link: string; lines: { name: string; qty: number }[] }) {
  try {
    if (!o.email || !mailConfigured()) return;
    await sendMail({
      to: o.email,
      subject: `Your MIEL+ order ${orderRef(o.number)}`,
      text: [`Hi ${o.name.split(" ")[0]},`, "", `We received your order ${orderRef(o.number)}.`, ...o.lines.map((l) => `${l.qty} x ${l.name}`), `Total: $${o.total.toFixed(2)}, cash on delivery.`, "", `Your order page: ${o.link}`, "We will confirm delivery details with you on WhatsApp."].join("\n"),
    });
  } catch (e) {
    console.error("customer confirmation email failed:", (e as Error).message);
  }
}
