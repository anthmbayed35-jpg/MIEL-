import { SACHETS_PER_POUCH } from "@/config/site";
import { orderRef } from "./order-ref";
import { STATUS_LABEL, type OrderStatus } from "./status";

const m = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

type Line = { name: string; qty: number; unitPrice: number };

/** Message the customer sends to the store on WhatsApp after ordering. */
export function orderMessage(o: {
  number: number | string;
  lines: Line[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  code?: string;
  region: string;
  customer: { name: string; phone: string; address: string; notes?: string };
}) {
  const rows = [
    `New MIEL+ order ${o.number}`,
    "",
    ...o.lines.map((l) => `${l.qty} x ${l.name} (${SACHETS_PER_POUCH} sachets) = ${m(l.qty * l.unitPrice)}`),
    "",
    `Subtotal: ${m(o.subtotal)}`,
    ...(o.discount ? [`Discount${o.code ? ` (${o.code})` : ""}: -${m(o.discount)}`] : []),
    `Delivery${o.region ? ` (${o.region})` : ""}: ${o.shipping ? m(o.shipping) : "Free"}`,
    `Total: ${m(o.total)} USD`,
    "Payment: Cash on delivery",
    "",
    `Name: ${o.customer.name}`,
    `Phone: ${o.customer.phone}`,
    `Address: ${o.customer.address}`,
    ...(o.customer.notes ? [`Notes: ${o.customer.notes}`] : []),
  ];
  return rows.join("\n");
}

/** Prefilled message the admin sends to a customer about their order. */
export function customerStatusMessage(o: { number: number; status: OrderStatus; total: number; customerName: string; tracking?: string; cod: boolean }) {
  const hi = `Hi ${o.customerName.split(" ")[0]}, it's MIEL+.`;
  const pay = o.cod ? ` Please have ${m(o.total)} ready (cash on delivery).` : "";
  switch (o.status) {
    case "new":
    case "draft":
      return `${hi} We got your order ${orderRef(o.number)}. We'll confirm delivery details shortly.`;
    case "confirmed":
      return `${hi} Your order ${orderRef(o.number)} is confirmed.${pay}`;
    case "packed":
      return `${hi} Your order ${orderRef(o.number)} is packed and will go out soon.`;
    case "out_for_delivery":
      return `${hi} Your order ${orderRef(o.number)} is out for delivery.${o.tracking ? ` Tracking: ${o.tracking}.` : ""}${pay}`;
    case "delivered":
      return `${hi} Your order ${orderRef(o.number)} was delivered. Enjoy and fuel the grind!`;
    case "cancelled":
      return `${hi} Your order ${orderRef(o.number)} was cancelled. Message us if you want to reorder.`;
    default:
      return `${hi} About your order ${orderRef(o.number)} (${STATUS_LABEL[o.status]}).`;
  }
}

export const abandonedMessage = (name: string, items: string) =>
  `Hi ${name.split(" ")[0] || "there"}, it's MIEL+. You left ${items} in your cart. Want us to finish your order? It's cash on delivery, and we deliver across Lebanon.`;
