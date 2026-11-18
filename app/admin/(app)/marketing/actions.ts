"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

const store = () => revalidatePath("/", "layout");

/* ---------- discounts ---------- */
export async function saveDiscount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("discounts.manage");
  const db = getDb();
  const id = String(fd.get("id") ?? "");
  const code = String(fd.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return { error: "Code must be 3 to 24 letters or numbers (e.g. WELCOME10)." };
  const type = String(fd.get("type"));
  if (!["percent", "fixed", "free_delivery"].includes(type)) return { error: "Pick a discount type." };
  const value = Number(fd.get("value") || 0);
  if (type === "percent" && (value <= 0 || value > 100)) return { error: "Percent must be between 1 and 100." };
  if (type === "fixed" && value <= 0) return { error: "Enter the amount off." };
  const products = fd.getAll("products").map(String).filter(Boolean);
  const date = (k: string) => (String(fd.get(k) ?? "") ? new Date(String(fd.get(k))).toISOString() : null);
  const row = {
    code, type, value: type === "free_delivery" ? 0 : value, min_order: Number(fd.get("min_order") || 0), product_ids: products.length ? products : null,
    starts_at: date("starts_at"), ends_at: date("ends_at"), usage_limit: fd.get("usage_limit") ? Math.floor(Number(fd.get("usage_limit"))) : null,
    active: fd.get("active") === "on",
  };
  try {
    if (id) must(await db.from("discounts").update(row).eq("id", id));
    else must(await db.from("discounts").insert({ ...row, used_count: 0, is_demo: false }));
  } catch (e) {
    return { error: /duplicate|unique/i.test((e as Error).message) ? "That code already exists." : (e as Error).message };
  }
  await audit(admin, id ? "discount_update" : "discount_create", "discount", id || code, { code, type, value });
  revalidatePath("/admin/marketing/discounts");
  return { ok: id ? "Discount saved." : `Discount ${code} created.` };
}

export async function toggleDiscount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("discounts.manage");
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  must(await getDb().from("discounts").update({ active }).eq("id", id));
  await audit(admin, active ? "discount_enable" : "discount_disable", "discount", id);
  revalidatePath("/admin/marketing/discounts");
  return { ok: active ? "Enabled." : "Disabled. (Codes are never deleted, so order history stays intact.)" };
}

/* ---------- abandoned checkouts ---------- */
export async function markContacted(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("marketing.manage");
  const id = String(fd.get("id"));
  must(await getDb().from("abandoned_checkouts").update({ contacted_at: new Date().toISOString() }).eq("id", id));
  await audit(admin, "recovery_contacted", "abandoned_checkout", id);
  revalidatePath("/admin/marketing");
  return { ok: "Marked as contacted." };
}

/* ---------- tracking ids ---------- */
export async function saveTracking(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("marketing.manage");
  const meta = String(fd.get("meta_pixel_id") ?? "").trim();
  const ga4 = String(fd.get("ga4_id") ?? "").trim();
  if (meta && !/^\d{6,20}$/.test(meta)) return { error: "Meta Pixel ID is numbers only (e.g. 123456789012345)." };
  if (ga4 && !/^G-[A-Z0-9]{4,14}$/.test(ga4)) return { error: "GA4 ID looks like G-XXXXXXXXXX." };
  must(await getDb().from("settings").upsert({ key: "tracking", value: { meta_pixel_id: meta, ga4_id: ga4 }, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  await audit(admin, "tracking_update", "settings", "tracking", { meta: !!meta, ga4: !!ga4 });
  store();
  return { ok: "Saved. The IDs are added to the storefront." };
}

/* ---------- content ---------- */
async function putContent(key: string, value: unknown) {
  must(await getDb().from("pages_content").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" }));
}

export async function saveAnnouncement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("content.manage");
  await putContent("announcement", { enabled: fd.get("enabled") === "on", text: String(fd.get("text") ?? "").slice(0, 160), link: String(fd.get("link") ?? "").slice(0, 300) });
  await audit(admin, "content_announcement", "content", "announcement");
  store();
  return { ok: "Announcement bar saved." };
}

export async function saveHero(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("content.manage");
  await putContent("hero", { headline1: String(fd.get("headline1") ?? "").slice(0, 40), headline2: String(fd.get("headline2") ?? "").slice(0, 40), sub: String(fd.get("sub") ?? "").slice(0, 200) });
  await audit(admin, "content_hero", "content", "hero");
  store();
  return { ok: "Home hero text saved." };
}

export async function saveFaq(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("content.manage");
  const items = String(fd.get("faq") ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf("|");
    return { q: (i === -1 ? l : l.slice(0, i)).trim(), a: i === -1 ? "" : l.slice(i + 1).trim() };
  });
  if (!items.length) return { error: "Add at least one question." };
  await putContent("faq", items);
  await audit(admin, "content_faq", "content", "faq", { count: items.length });
  store();
  return { ok: `${items.length} FAQ items saved.` };
}

async function testimonials(): Promise<Row[]> {
  const r = (must(await getDb().from("pages_content").select("*").eq("key", "testimonials")) as Row[])[0];
  return (r?.value as Row[]) ?? [];
}

export async function addTestimonial(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("content.manage");
  const text = String(fd.get("text") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  if (!text || !name) return { error: "Add the name and the quote." };
  const list = await testimonials();
  list.push({ id: crypto.randomUUID(), name: name.slice(0, 60), text: text.slice(0, 400), rating: Math.min(5, Math.max(1, Number(fd.get("rating")) || 5)), approved: false });
  await putContent("testimonials", list);
  await audit(admin, "testimonial_add", "content", name);
  revalidatePath("/admin/marketing/content");
  return { ok: "Added as pending. Approve it to show it on the store." };
}

export async function setTestimonial(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("content.manage");
  const id = String(fd.get("id"));
  const act = String(fd.get("act"));
  let list = await testimonials();
  if (act === "remove") list = list.filter((t) => t.id !== id);
  else list = list.map((t) => (t.id === id ? { ...t, approved: act === "approve" } : t));
  await putContent("testimonials", list);
  await audit(admin, `testimonial_${act}`, "content", id);
  store();
  revalidatePath("/admin/marketing/content");
  return { ok: act === "remove" ? "Removed." : act === "approve" ? "Approved and live." : "Hidden from the store." };
}
