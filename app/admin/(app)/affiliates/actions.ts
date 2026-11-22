"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AFFILIATE_TIERS, type AffiliateTier } from "@/config/affiliates";
import { audit } from "@/lib/audit";
import { approveApplication, createAffiliate, generateCode, recordPayout, rejectApplication, updateAffiliate, upgradeTier, type AffiliateInput } from "@/lib/affiliates";
import { requirePerm } from "@/lib/auth";
import { formVersion, orFail } from "@/lib/version";
import type { ActionState } from "@/components/admin/ActionForm";

const refresh = (id?: string) => {
  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/affiliates/applications");
  if (id) revalidatePath(`/admin/affiliates/${id}`);
};

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const input = (fd: FormData): AffiliateInput => ({
  name: text(fd, "name"), instagram_handle: text(fd, "instagram_handle"), phone: text(fd, "phone"), email: text(fd, "email"), code: text(fd, "code"),
  tier: text(fd, "tier") || "seed", status: text(fd, "status") || "active", payout_method: text(fd, "payout_method"), notes: text(fd, "notes"),
  commission_percent: text(fd, "commission_percent") === "" ? undefined : Number(text(fd, "commission_percent")),
  customer_discount_percent: text(fd, "customer_discount_percent") === "" ? undefined : Number(text(fd, "customer_discount_percent")),
});

/** Create or edit an affiliate (everything is validated again on the server). */
export async function saveAffiliate(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(() => saveAffiliateImpl(fd));
}
async function saveAffiliateImpl(fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("affiliates.manage");
  const id = text(fd, "id");
  if (id) {
    const a = updateAffiliate(id, input(fd), formVersion(fd));
    await audit(admin, "affiliate_update", "affiliate", id, { code: a.code, tier: a.tier, status: a.status, commission_rate_x100: a.commission_rate_x100 });
    refresh(id);
    return { ok: "Saved." };
  }
  const a = createAffiliate(input(fd));
  await audit(admin, "affiliate_create", "affiliate", a.id, { code: a.code });
  refresh(a.id);
  redirect(`/admin/affiliates/${a.id}?created=1`);
}

/** The "Generate" button next to the code field: a random free code from the name. */
export async function suggestCode(_p: unknown, fd: FormData): Promise<{ code: string } | { error: string }> {
  await requirePerm("affiliates.manage");
  const name = String(fd?.get?.("name") ?? "").trim();
  if (name.length < 2) return { error: "Type the name first." };
  return { code: generateCode(name) };
}

export async function upgradeTierAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const id = text(fd, "id");
    const to = text(fd, "to") as AffiliateTier;
    if (!AFFILIATE_TIERS.includes(to)) return { error: "Unknown tier." };
    const a = upgradeTier(id, to);
    await audit(admin, "affiliate_tier", "affiliate", id, { tier: to, commission_rate_x100: a.commission_rate_x100 });
    refresh(id);
    return { ok: `Upgraded to ${to}. The new commission rate applies to orders placed from now on.` };
  });
}

/** Pays every approved commission of this affiliate and records the payout. */
export async function recordPayoutAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const id = text(fd, "id");
    const p = recordPayout(id, { method: text(fd, "method"), note: text(fd, "note") });
    await audit(admin, "affiliate_payout", "affiliate", id, { amount_cents: p.amountCents, orders: p.orders });
    refresh(id);
    return { ok: `Payout of $${(p.amountCents / 100).toFixed(2)} recorded for ${p.orders} order${p.orders === 1 ? "" : "s"}${p.correctionsCents ? ` (after a correction of $${(p.correctionsCents / 100).toFixed(2)})` : ""}.` };
  });
}

export async function approveApplicationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const a = approveApplication(text(fd, "id"));
    await audit(admin, "affiliate_application_approve", "affiliate_application", text(fd, "id"), { affiliate: a.id, code: a.code });
    refresh(a.id);
    return { ok: `Approved. Code ${a.code} created, open it to adjust the rates.` };
  });
}

export async function rejectApplicationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    rejectApplication(text(fd, "id"));
    await audit(admin, "affiliate_application_reject", "affiliate_application", text(fd, "id"));
    refresh();
    return { ok: "Application rejected." };
  });
}
