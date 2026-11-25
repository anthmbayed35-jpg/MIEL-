"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { approveUnlisted, dismissUnlisted, mergeUnlisted } from "@/lib/locations";
import { orFail } from "@/lib/version";
import type { ActionState } from "@/components/admin/ActionForm";

const done = () => {
  revalidatePath("/admin/settings/locations/unlisted");
  revalidatePath("/admin/settings/locations");
  revalidatePath("/admin/orders");
};
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Approve what customers typed as a NEW region of its district: customers see it at checkout straight away, and the orders are linked to it. */
export async function approveUnlistedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    const regionId = approveUnlisted(text(fd, "id"), text(fd, "name_en"), text(fd, "name_ar"));
    await audit(admin, "unlisted_approve", "location", regionId, { unlisted: text(fd, "id"), name: text(fd, "name_en") });
    done();
    return { ok: "Approved: it is now a region customers can choose. The orders were linked to it." };
  });
}

/** Merge into an existing region of the same district: the typed text becomes one of its aliases. */
export async function mergeUnlistedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    mergeUnlisted(text(fd, "id"), text(fd, "region"));
    await audit(admin, "unlisted_merge", "location", text(fd, "region"), { unlisted: text(fd, "id") });
    done();
    return { ok: "Merged: the typed spelling is now an alias of that region. The orders were linked to it." };
  });
}

export async function dismissUnlistedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    dismissUnlisted(text(fd, "id"));
    await audit(admin, "unlisted_dismiss", "unlisted_area", text(fd, "id"), {});
    done();
    return { ok: "Dismissed." };
  });
}
