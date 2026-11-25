"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb, usesDb, must, type Row } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { createOrder, quoteOrder } from "@/lib/orders";
import { orderMessage } from "@/lib/messages";
import { normalizeLebanesePhone, waLink } from "@/lib/phone";
import { ipFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { previewAdmin } from "@/lib/preview";
import { inMaintenance, STOREFRONT_CLOSED, TEST_ORDER_CONFIRMATION } from "@/lib/site-mode";
import { notifyCustomerOrder, notifyNewOrder } from "@/lib/notify";
import { addressLine, zoneFor } from "@/lib/lebanon";
import { orderRef } from "@/lib/order-ref";
import { paymentMethod } from "@/lib/payments";
import { absoluteUrl } from "@/lib/site-url";

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
  // Under development: no cart and no prices for the public. A signed-in admin previewing the storefront may see prices.
  if (inMaintenance() && !(await previewAdmin())) return { ...STOREFRONT_CLOSED, subtotal: 0, discount: 0, shipping: 0, total: 0, freeDelivery: false };
  if (code.trim()) {
    // discount-code guessing is rate limited per connection (stored in the database, survives restarts)
    const ip = ipFromHeaders(await headers());
    if (!rateLimit(`discount:${ip}`, 30, 60_000)) return { ok: false, error: "Too many code attempts. Wait a minute.", subtotal: 0, discount: 0, shipping: 0, total: 0, freeDelivery: false };
  }
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

export type PlaceResult =
  | { ok: true; orderNumber: string; token: string | null; whatsappUrl: string; total: number; test?: boolean }
  | { ok: false; error: string; field?: string };

export type PlaceInput = {
  items: CartInput;
  customer: { name: string; phone: string; email?: string };
  delivery: { governorate: string; district: string; street: string; landmark: string; notes: string };
  paymentMethod?: string;
  code: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  website?: string; // honeypot
  idempotencyKey?: string;
  attribution?: "code" | "link";
  heardFrom?: string;
  /** Preview only: the exact confirmation text, sent when the admin ticked "this is a test order". */
  confirmation?: string;
};

const bad = (error: string, field?: string): PlaceResult => ({ ok: false, error, field });

/**
 * Place an order from /checkout. Nothing the browser says about money is trusted: only product ids and quantities are read, prices,
 * delivery fee, discount, stock and the delivery zone are all decided here from the database. Rate limited per connection and per phone.
 */
export async function placeOrder(input: PlaceInput): Promise<PlaceResult> {
  // While the storefront is hidden NO real order can be placed, by anyone. A signed-in admin (checked here from the session,
  // never from anything the browser claims) may place a TEST order, and only after explicitly confirming it.
  let test: { by: string } | undefined;
  if (inMaintenance()) {
    const admin = await previewAdmin();
    if (!admin) return STOREFRONT_CLOSED;
    if (input.confirmation !== TEST_ORDER_CONFIRMATION)
      return { ok: false, error: "Preview mode: the storefront is hidden, so no real order can be placed. Tick \"This is a test order\" to place a clearly marked TEST order." };
    test = { by: admin.email };
  }
  try {
    if (input.website) return bad("Something went wrong. Try again."); // bots fill the hidden field
    const h = await headers();
    const ip = ipFromHeaders(h);
    if (!rateLimit(`order:${ip}`, 5, 10 * 60_000)) return bad("Too many orders from this connection. Please wait a few minutes or message us on WhatsApp.");

    // ---- validate everything again, in plain language
    const name = String(input.customer?.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2) return bad("Enter your full name.", "name");
    if (name.length > 80) return bad("That name is too long.", "name");
    const phone = normalizeLebanesePhone(String(input.customer?.phone ?? ""));
    if (!phone) return bad("Enter a valid Lebanese phone number, for example 03 123 456 or +961 70 123 456.", "phone");
    const email = String(input.customer?.email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email address does not look right. You can also leave it empty.", "email");
    const d = input.delivery;
    const gov = String(d?.governorate ?? "");
    const district = String(d?.district ?? "");
    const zoneName = zoneFor(gov, district);
    if (!gov) return bad("Choose your governorate.", "governorate");
    if (!zoneName) return bad("Choose your district.", "district");
    const street = String(d?.street ?? "").trim().replace(/\s+/g, " ");
    if (street.length < 5) return bad("Enter your street, building and floor so the courier can find you.", "street");
    const landmark = String(d?.landmark ?? "").trim().replace(/\s+/g, " ");
    const notes = String(d?.notes ?? "").trim();
    if (street.length > 200 || landmark.length > 120 || notes.length > 500) return bad("One of the address fields is too long.", "street");
    const items = (input.items ?? []).filter((i) => i && Number.isInteger(i.qty) && i.qty > 0);
    if (!items.length) return bad("Your cart is empty. Add a flavour first.");

    const cat = await getCatalog();
    const wa = cat.store.whatsapp;
    const method = paymentMethod(String(input.paymentMethod ?? "cod"), cat.store.cod_enabled);
    if (!method) return bad(cat.live && !cat.store.cod_enabled ? "Online ordering is paused right now. Message us on WhatsApp and we'll take your order." : "Choose a payment method.", "payment");
    const address = addressLine({ street, district, governorate: gov, landmark });

    // No database yet: keep the original behaviour (WhatsApp-only order, prices from the config).
    if (!cat.live || !usesDb()) {
      const lines = items
        .map((i) => ({ i, p: cat.products.find((p) => p.id === i.productId) }))
        .filter((x) => x.p && x.i.qty < 100)
        .map((x) => ({ name: x.p!.name, qty: x.i.qty, unitPrice: x.p!.price }));
      if (!lines.length) return bad("Your cart is empty.");
      const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
      const number = "M" + Date.now().toString(36).toUpperCase();
      const text = orderMessage({ number, lines, subtotal, discount: 0, shipping: 0, total: subtotal, region: zoneName, customer: { name, phone, address, notes } });
      return { ok: true, orderNumber: number, token: null, whatsappUrl: waLink(wa, text), total: subtotal };
    }

    // The zone must exist and be switched on in the admin (Settings > Shipping), else we do not deliver there (yet).
    if (!cat.zones.some((z) => z.name === zoneName && z.active)) return bad(`We don't deliver to ${gov} yet. Message us on WhatsApp and we'll find a way.`, "governorate");

    // Per-phone limit against the database (works across serverless instances)
    const db = getDb();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const cust = (must(await db.from("customers").select("id").eq("phone", phone)) as Row[])[0];
    if (cust) {
      const recent = must(await db.from("orders").select("id").eq("customer_id", cust.id).gte("created_at", hourAgo)) as Row[];
      if (recent.length >= 3) return bad("You've placed several orders in the last hour. Message us on WhatsApp to change an order.");
    }

    const { order, quote } = await createOrder({
      customer: { name, phone, address, notes, email: email || undefined },
      items,
      region: zoneName,
      delivery: { governorate: gov, district, street, landmark },
      paymentMethod: method.id,
      code: input.code,
      source: "web",
      utm: input.utm,
      actor: "customer",
      idempotencyKey: input.idempotencyKey,
      attribution: input.attribution === "link" ? "link" : "code",
      heardFrom: String(input.heardFrom ?? "").slice(0, 80),
      test,
    });
    // Mark any abandoned checkout for this phone as recovered
    await db.from("abandoned_checkouts").update({ recovered: true }).eq("phone", phone);

    const ref = orderRef(order.order_number);
    const text = orderMessage({
      number: ref, lines: quote.lines, subtotal: quote.subtotal, discount: quote.discount, shipping: quote.shipping,
      total: quote.total, code: quote.code, region: zoneName, customer: { name, phone, address, notes },
    });
    revalidatePath("/admin", "layout");
    const token = String(order.public_token);
    if (test) return { ok: true, orderNumber: ref, token, whatsappUrl: "", total: quote.total, test: true }; // no WhatsApp, no alert email
    void notifyNewOrder({ number: order.order_number, total: quote.total, customer: name, phone, region: zoneName, lines: quote.lines });
    void notifyCustomerOrder({ email, number: order.order_number, total: quote.total, name, link: absoluteUrl(`/order/${token}`), lines: quote.lines });
    return { ok: true, orderNumber: ref, token, whatsappUrl: waLink(wa, text), total: quote.total };
  } catch (e) {
    return bad(e instanceof Error && e.message ? e.message : "Could not place the order. Please try again or message us on WhatsApp.");
  }
}

/** Remember a started checkout (name + valid phone) so the store can follow up on WhatsApp. */
export async function captureCheckout(input: { name: string; phone: string; items: CartInput; utm_source?: string }) {
  if (inMaintenance()) return;
  try {
    if (!usesDb()) return;
    const phone = normalizeLebanesePhone(input.phone);
    if (!phone || !input.items.length) return;
    const h = await headers();
    if (!rateLimit(`cap:${ipFromHeaders(h)}`, 20, 10 * 60_000)) return;
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
