import { CURRENCY, SACHETS_PER_POUCH, WHATSAPP_NUMBER } from "@/config/site";
import { products } from "@/config/products";
import { money } from "./format";

export type Customer = { name: string; phone: string; address: string; notes: string };

export type Order = {
  id: string;
  createdAt: string;
  customer: Customer;
  items: { id: string; name: string; qty: number; unitPrice: number }[];
  total: number;
  currency: string;
  payment: "cash_on_delivery";
};

export function buildOrder(lines: Record<string, number>, customer: Customer): Order {
  const items = Object.entries(lines)
    .map(([id, qty]) => {
      const p = products.find((x) => x.id === id);
      return p ? { id, name: p.name, qty, unitPrice: p.price } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.qty > 0);
  return {
    id: "M" + Date.now().toString(36).toUpperCase(),
    createdAt: new Date().toISOString(),
    customer,
    items,
    total: items.reduce((n, i) => n + i.qty * i.unitPrice, 0),
    currency: CURRENCY,
    payment: "cash_on_delivery",
  };
}

/**
 * TODO: Orders only live in this browser's localStorage + the WhatsApp message.
 * Replace with a real backend (DB / Google Sheet / Shopify) and a payment gateway
 * (e.g. Whish, OMT, Stripe) plus a delivery integration (e.g. courier API) when ready.
 */
export function storeOrder(order: Order) {
  try {
    const raw = localStorage.getItem("miel_orders_v1");
    const all: Order[] = raw ? JSON.parse(raw) : [];
    all.push(order);
    localStorage.setItem("miel_orders_v1", JSON.stringify(all));
  } catch {}
}

export function whatsappUrl(order: Order): string {
  const lines = [
    `New MIEL+ order ${order.id}`,
    "",
    ...order.items.map((i) => `${i.qty} x ${i.name} (${SACHETS_PER_POUCH} sachets) = ${money(i.qty * i.unitPrice)}`),
    "",
    `Total: ${money(order.total)} ${order.currency}`,
    "Payment: Cash on delivery",
    "",
    `Name: ${order.customer.name}`,
    `Phone: ${order.customer.phone}`,
    `Address: ${order.customer.address}`,
    order.customer.notes ? `Notes: ${order.customer.notes}` : "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n").trim())}`;
}
