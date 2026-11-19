"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { deleteUpload, saveProductImage } from "@/lib/storage";
import type { ActionState } from "@/components/admin/ActionForm";

const refresh = (id?: string) => {
  revalidatePath("/", "layout"); // storefront (home, product pages, sitemap) picks up the change
  revalidatePath("/admin/products");
  if (id) revalidatePath(`/admin/products/${id}`);
};
const fail = (e: unknown): ActionState => ({ error: e instanceof Error ? e.message : "Something went wrong." });

/** "Label | value" lines -> [{a, b}]. Blank value stays blank (rendered as TBC for nutrition facts). */
function lines(text: string, sep: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(sep);
    return i === -1 ? { a: l, b: "" } : { a: l.slice(0, i).trim(), b: l.slice(i + 1).trim() };
  });
}
const nullable = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s.toUpperCase() !== "TBC" ? s : null;
};
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(v));

export async function saveProduct(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("products.write");
  const db = getDb();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  if (!name) return { error: "Give the product a name." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { error: "Slug can only use lowercase letters, numbers and dashes (e.g. red-burn)." };
  const price = Number(fd.get("price"));
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a valid price." };
  const kind = fd.get("kind") === "bundle" ? "bundle" : "single";
  const bundle = kind === "bundle"
    ? [...fd.entries()].filter(([k, v]) => k.startsWith("bundle_") && Number(v) > 0).map(([k, v]) => ({ product_id: k.slice(7), qty: Math.floor(Number(v)) }))
    : null;
  if (kind === "bundle" && !bundle?.length) return { error: "A bundle needs at least one product in it." };

  const row = {
    slug, name, kind, descriptor: String(fd.get("descriptor") ?? "").trim(), flavor: String(fd.get("flavor") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(), spec: String(fd.get("spec") ?? "").trim(),
    price, compare_at_price: num(fd.get("compare_at_price")), sachet_count: Math.max(1, Math.floor(Number(fd.get("sachet_count")) || 12)),
    sachet_weight_g: num(fd.get("sachet_weight_g")), glow: String(fd.get("glow") ?? "").trim() || "rgba(218,252,105,0.3)",
    chips: String(fd.get("chips") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    compare_spec: String(fd.get("compare_spec") ?? "").trim(),
    facts: lines(String(fd.get("facts") ?? ""), ":").map((l) => ({ label: l.a, value: l.b && l.b.toUpperCase() !== "TBC" ? l.b : null })),
    ingredients: nullable(fd.get("ingredients")), allergens: nullable(fd.get("allergens")), warning: nullable(fd.get("warning")),
    how_to: lines(String(fd.get("how_to") ?? ""), "|").map((l) => ({ title: l.a, text: l.b })),
    why: lines(String(fd.get("why") ?? ""), "|").map((l) => ({ title: l.a, text: l.b })),
    faqs: lines(String(fd.get("faqs") ?? ""), "|").map((l) => ({ q: l.a, a: l.b })),
    bundle_items: bundle, seo_title: nullable(fd.get("seo_title")), seo_description: nullable(fd.get("seo_description")),
    status: ["active", "draft", "archived"].includes(String(fd.get("status"))) ? String(fd.get("status")) : "draft",
    updated_at: new Date().toISOString(),
  };

  try {
    if (id) {
      const before = must(await db.from("products").select("price, status, slug").eq("id", id).single()) as Row;
      const ver = Number(fd.get("version"));
      const upd = db.from("products").update(row).eq("id", id);
      if (ver > 0) upd.ifVersion(ver); // two admins editing the same product: the second save is refused, not silently merged
      must(await upd);
      await audit(admin, "product_update", "product", id, { name, price: { from: Number(before.price), to: price }, status: { from: before.status, to: row.status } });
      refresh(id);
      return { ok: "Saved. The storefront will update within a moment." };
    }
    const count = (must(await db.from("products").select("id")) as Row[]).length;
    const created = must(await db.from("products").insert({ ...row, og_image: null, sort: count }).select().single()) as Row;
    must(await db.from("inventory_items").insert({ product_id: created.id, sku: `MIEL-${slug.toUpperCase()}`, on_hand: 0, low_stock_threshold: 10 }));
    await audit(admin, "product_create", "product", created.id, { name });
    refresh(created.id);
    redirect(`/admin/products/${created.id}?created=1`);
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT" || (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    const m = (e as Error).message;
    return { error: /duplicate|unique/i.test(m) ? "That slug is already used by another product." : m };
  }
}

export async function archiveProduct(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("products.write");
  const id = String(fd.get("id"));
  const to = fd.get("restore") === "1" ? "draft" : "archived";
  must(await getDb().from("products").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id));
  await audit(admin, to === "archived" ? "product_archive" : "product_restore", "product", id);
  refresh(id);
  return { ok: to === "archived" ? "Archived. It's hidden from the store but nothing was deleted." : "Restored as a draft." };
}

export async function uploadImage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("products.write");
  const id = String(fd.get("id"));
  const db = getDb();
  try {
    const file = fd.get("file") as File | null;
    const src = await saveProductImage(file as File);
    try {
      const mine = (must(await db.from("product_images").select("*").eq("product_id", id)) as Row[]);
      must(await db.from("product_images").insert({ product_id: id, kind: "extra", src, alt: String(fd.get("alt") ?? "").trim(), label: "EXTRA", sort: mine.length }));
    } catch (e) {
      deleteUpload(src); // don't leave orphan files on the volume
      throw e;
    }
    await audit(admin, "image_upload", "product", id);
    refresh(id);
    return { ok: "Image uploaded. Add alt text below, then reorder if you like." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateImage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("products.write");
  const imgId = String(fd.get("image_id"));
  const kinds = ["pouch-hero", "flat-lay", "sachet-open", "ingredients", "extra"];
  const kind = kinds.includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "extra";
  const img = must(await getDb().from("product_images").update({ alt: String(fd.get("alt") ?? "").trim(), label: String(fd.get("label") ?? "").trim().toUpperCase().slice(0, 24), kind }).eq("id", imgId).select().single()) as Row;
  await audit(admin, "image_update", "product", img.product_id);
  refresh(img.product_id);
  return { ok: "Image details saved." };
}

export async function moveImage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("products.write");
  const db = getDb();
  const imgId = String(fd.get("image_id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const img = must(await db.from("product_images").select("*").eq("id", imgId).single()) as Row;
  const all = (must(await db.from("product_images").select("*").eq("product_id", img.product_id).order("sort", { ascending: true })) as Row[]);
  const i = all.findIndex((x) => x.id === imgId);
  const j = i + dir;
  if (j < 0 || j >= all.length) return null;
  const order = all.map((x) => x.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [n, oid] of order.entries()) await db.from("product_images").update({ sort: n }).eq("id", oid);
  await audit(admin, "image_reorder", "product", img.product_id);
  refresh(img.product_id);
  return { ok: "Reordered." };
}

export async function deleteImage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("data.delete");
  const db = getDb();
  const imgId = String(fd.get("image_id"));
  const img = must(await db.from("product_images").select("*").eq("id", imgId).single()) as Row;
  must(await db.from("product_images").delete().eq("id", imgId));
  deleteUpload(String(img.src)); // no-op for the built-in photos in /public
  await audit(admin, "image_delete", "product", img.product_id, { src: img.src });
  refresh(img.product_id);
  return { ok: "Image removed from this product." };
}
