"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { addRegion, parseAliases, renameLocation, setLocationHidden } from "@/lib/locations";
import { formVersion, orFail } from "@/lib/version";
import type { ActionState } from "@/components/admin/ActionForm";

const done = () => {
  revalidatePath("/admin/settings/locations");
  revalidatePath("/checkout"); // the checkout lists are read per request; this also refreshes any cached copy
};
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** One button per row: save the name (English and Arabic), hide the place from checkout, or show it again. */
export async function updateLocation(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    const id = text(fd, "id");
    const op = text(fd, "op");
    if (op === "hide" || op === "show") {
      setLocationHidden(id, op === "hide");
      await audit(admin, op === "hide" ? "location_hide" : "location_show", "location", id, {});
      done();
      return { ok: op === "hide" ? "Hidden: customers no longer see it at checkout." : "Shown at checkout again." };
    }
    renameLocation(id, text(fd, "name_en"), text(fd, "name_ar"), formVersion(fd), fd.has("aliases") ? parseAliases(text(fd, "aliases")) : undefined);
    await audit(admin, "location_rename", "location", id, { name_en: text(fd, "name_en"), name_ar: text(fd, "name_ar") });
    done();
    return { ok: "Saved. Orders already placed keep the name they were placed with." };
  });
}

/** Add a region the official list is missing. It belongs to exactly one district. */
export async function addRegionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    const id = addRegion(text(fd, "district"), text(fd, "name_en"), text(fd, "name_ar"), fd.has("aliases") ? parseAliases(text(fd, "aliases")) : []);
    await audit(admin, "location_add", "location", id, { district: text(fd, "district"), name_en: text(fd, "name_en") });
    done();
    return { ok: `Added ${text(fd, "name_en").trim()}.` };
  });
}
