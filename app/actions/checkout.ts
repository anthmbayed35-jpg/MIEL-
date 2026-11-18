"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb, usesDb, must, type Row } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { createOrder, quoteOrder } from "@/lib/orders";
import { orderMessage } from "@/lib/messages";
import { normalizeLebanesePhone, waLink } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { notifyNewOrder } from "@/lib/notify";

export type CartInput = { productId: string; qty: number }[];
export type QuoteView = {
  ok: boolean;
  error?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  freeDelivery: boolean;
  codeMessage?: string;
  eta?: string;
};

/** Live price preview for the cart drawer (shipping zone + discount code). */
export async function quoteAction(items: CartInput, region: string, code: string): Promise<QuoteView> {
  if (!usesDb()) return fallbackQuote(items);
  const cat = await getCatalog();
  if (!cat.live) return fallbackQuote(items);
  const q = await quoteOrder({ items, region, code });
  return { ok: q.ok, error: q.error, subtotal: q.subtotal, discount: q.discount, shipping: q.shipping, total: q.total, freeDelivery: q.freeDelivery, codeMessage: q.codeMessage, eta: q.zone?.eta };
}

async function fallbackQuote(items: CartInput): Promise<QuoteView> {
  const cat = await getCatalog();
  const subtotal = items.reduce((n, i) => n + i.qty * (cat.products.find((p) => p.id === i.productId)?.price ?? 0), 0);
  return { ok: subtotal > 0, subtotal, discount: 0, shipping: 0, total: subtotal, freeDelivery: false };
}

export type PlaceResult = { ok: true; orderNumber: string; whatsappUrl: string; total: number } | { ok: false; error: string };

export async function placeOrder(input: {
  items: CartInput;
  customer: { name: string; phone: string; address: string; notes: string };
  region: string;
  code: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  website?: string; // honeypot
}): Promise<PlaceResult> {
  try {
    if (input.website) return { ok: false, error: "Something went wrong. Try again." }; // bots fill the hidden field
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (!rateLimit(`order:${ip}`, 5, 10 * 60_000)) return { ok: false, error: "Too many orders from this connection. Please wait a few minutes or message us on WhatsApp." };

    const phone = normalizeLebanesePhone(input.customer.phone);
    if (!phone) return { ok: false, error: "Enter a valid Lebanese phone number, e.g. 03 123 456 or +961 70 123 456." };
    if (input.customer.name.length > 80 || input.customer.address.length > 300 || input.customer.notes.length > 500) return { ok: false, error: "That text is too long." };

    const cat = await getCatalog();
    const wa = cat.store.whatsapp;
    if (cat.live && !cat.store.cod_enabled) return { ok: false, error: "Online ordering is paused right now. Message us on WhatsApp and we'll take your order." };

    // No database yet: keep the original behaviour (WhatsApp-only order, prices from the config).
    if (!cat.live || !usesDb()) {
      const lines = input.items
        .map((i) => ({ i, p: cat.products.find((p) => p.id === i.productId) }))
        .filter((x) => x.p && x.i.qty > 0 && x.i.qty < 100)
        .map((x) => ({ name: x.p!.name, qty: x.i.qty, unitPrice: x.p!.price }));
      if (!lines.length) return { ok: false, error: "Your cart is empty." };
      const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
      const number = "M" + Date.now().toString(36).toUpperCase();
      const text = orderMessage({ number, lines, subtotal, discount: 0, shipping: 0, total: subtotal, region: input.region, customer: { ...input.customer, phone } });
      return { ok: true, orderNumber: number, whatsappUrl: waLink(wa, text), total: subtotal };
    }

    // Per-phone limit against the database (works across serverless instances)
    const db = getDb();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const cust = (must(await db.from("customers").select("id").eq("phone", phone)) as Row[])[0];
    if (cust) {
      const recent = must(await db.from("orders").select("id").eq("customer_id", cust.id).gte("created_at", hourAgo)) as Row[];
      if (recent.length >= 3) return { ok: false, error: "You've placed several orders in the last hour. Message us on WhatsApp to change an order." };
    }

    const { order, quote } = await createOrder({
      customer: { ...input.customer, phone },
      items: input.items,
      region: input.region,
      code: input.code,
      source: "web",
      utm: input.utm,
      actor: "customer",
    });
    // Mark any abandoned checkout for this phone as recovered
    await db.from("abandoned_checkouts").update({ recovered: true }).eq("phone", phone);

    const text = orderMessage({
      number: order.order_number, lines: quote.lines, subtotal: quote.subtotal, discount: quote.discount, shipping: quote.shipping,
      total: quote.total, code: quote.code, region: input.region, customer: { ...input.customer, phone },
    });
    revalidatePath("/admin", "layout");
    void notifyNewOrder({ number: order.order_number, total: quote.total, customer: input.customer.name, phone, region: input.region, lines: quote.lines });
    return { ok: true, orderNumber: String(order.order_number), whatsappUrl: waLink(wa, text), total: quote.total };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Could not place the order. Please try again or message us on WhatsApp." };
  }
}

/** Remember a started checkout (name + valid phone) so the store can follow up on WhatsApp. */
export async function captureCheckout(input: { name: string; phone: string; items: CartInput; utm_source?: string }) {
  try {
    if (!usesDb()) return;
    const phone = normalizeLebanesePhone(input.phone);
    if (!phone || !input.items.length) return;
    const h = await headers();
    if (!rateLimit(`cap:${(h.get("x-forwarded-for") ?? "u").split(",")[0]}`, 20, 10 * 60_000)) return;
    const cat = await getCatalog();
    const items = input.items
      .map((i) => ({ qty: i.qty, p: cat.products.find((p) => p.id === i.productId) }))
      .filter((x) => x.p)
      .map((x) => ({ name: x.p!.name, qty: x.qty, price: x.p!.price }));
    if (!items.length) return;
    const total = items.reduce((n, i) => n + i.qty * i.price, 0);
    const db = getDb();
    const existing = (must(await db.from("abandoned_checkouts").select("id").eq("phone", phone).eq("recovered", false)) as Row[])[0];
    const row = { name: input.name.slice(0, 80), phone, items, total, utm_source: input.utm_source ?? null };
    if (existing) await db.from("abandoned_checkouts").update(row).eq("id", existing.id);
    else await db.from("abandoned_checkouts").insert({ ...row, recovered: false, contacted_at: null, is_demo: false });
  } catch {}
}
