"use server";

import { revalidatePath } from "next/cache";
import { AFFILIATE_TIERS } from "@/config/affiliates";
import { audit } from "@/lib/audit";
import {
  addAnnouncement, addResource, deleteAnnouncement, deleteResource, rejectPayoutRequest, saveApplicationNotes, saveMission, setKitStatus, setMissionStatus,
} from "@/lib/ambassador/admin";
import { saveUpload } from "@/lib/ambassador/files";
import { reviewSubmission } from "@/lib/ambassador/portal";
import { requirePerm } from "@/lib/auth";
import { getProgram, mergeProgram } from "@/lib/program";
import { saveVersioned } from "@/lib/versioned";
import { orFail } from "@/lib/version";
import type { ActionState } from "@/components/admin/ActionForm";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const refresh = () => {
  for (const p of ["", "/settings", "/missions", "/kits", "/content", "/payouts", "/reports", "/applications"]) revalidatePath(`/admin/affiliates${p}`);
};

/** Program settings (tiers, thresholds, rates, perks, discount, hold, minimum payout, terms, banner). Owner and manager. A stale form is refused. */
export async function saveProgramAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const cur = getProgram();
    const next = {
      tiers: Object.fromEntries(
        AFFILIATE_TIERS.map((t) => [t, {
          label: text(fd, `${t}_label`), minDelivered: Number(text(fd, `${t}_min`)), commissionPercent: Number(text(fd, `${t}_commission`)),
          perks: text(fd, `${t}_perks`).split("\n").map((s) => s.trim()).filter(Boolean),
        }]),
      ),
      customerDiscountPercent: Number(text(fd, "discount")), holdDays: Number(text(fd, "hold")),
      minPayoutCents: Math.round(Number(text(fd, "min_payout")) * 100), autoUpgrade: fd.get("auto_upgrade") === "on",
      termsVersion: cur.termsVersion, termsText: text(fd, "terms").trim() || cur.termsText,
      banner: { enabled: fd.get("banner_on") === "on", text: text(fd, "banner_text") },
    };
    if (!(next.minPayoutCents >= 100)) return { error: "The minimum payout must be at least $1." };
    if (next.holdDays < 0 || next.holdDays > 365 || !Number.isInteger(next.holdDays)) return { error: "The hold period must be a whole number of days (0 to 365)." };
    for (const t of AFFILIATE_TIERS) {
      const x = next.tiers[t];
      if (!(x.commissionPercent >= 0 && x.commissionPercent <= 100) || !Number.isFinite(x.minDelivered) || x.minDelivered < 0) return { error: `Check the numbers for ${t}: delivered orders and commission %.` };
    }
    if (!(next.customerDiscountPercent >= 0 && next.customerDiscountPercent <= 100)) return { error: "The follower discount must be between 0 and 100%." };
    if (next.tiers.seed.minDelivered !== 0 || next.tiers.athlete.minDelivered >= next.tiers.ambassador.minDelivered) return { error: "Thresholds must go up: first level 0, then Athlete below Ambassador." };
    const merged = mergeProgram(next);
    const termsChanged = merged.termsText.trim() !== cur.termsText.trim();
    if (termsChanged) merged.termsVersion = cur.termsVersion + 1; // everyone must accept the new version
    saveVersioned("settings", "ambassador_program", merged, fd);
    await audit(admin, "ambassador_program_update", "settings", "ambassador_program", { termsVersion: merged.termsVersion, termsChanged, autoUpgrade: merged.autoUpgrade });
    refresh();
    revalidatePath("/", "layout");
    return { ok: termsChanged ? `Saved. The terms are now version ${merged.termsVersion}: every ambassador must accept them again.` : "Saved." };
  });
}

export async function saveMissionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const id = saveMission({ id: text(fd, "id") || undefined, title: text(fd, "title"), description: text(fd, "description"), rewardDollars: text(fd, "reward"), rewardText: text(fd, "reward_text"), month: text(fd, "month") });
    await audit(admin, "mission_save", "mission", id, { title: text(fd, "title") });
    refresh();
    return { ok: "Saved." };
  });
}

export async function setMissionStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const status = text(fd, "status") === "ended" ? "ended" : "active";
    setMissionStatus(text(fd, "id"), status);
    await audit(admin, "mission_status", "mission", text(fd, "id"), { status });
    refresh();
    return { ok: status === "ended" ? "Mission ended." : "Mission reopened." };
  });
}

/** Approve (credits the reward) or reject (with a note) a proof. */
export async function reviewSubmissionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const approve = text(fd, "decision") === "approve";
    reviewSubmission(text(fd, "id"), approve, text(fd, "note"));
    await audit(admin, approve ? "mission_proof_approve" : "mission_proof_reject", "mission_submission", text(fd, "id"), {});
    refresh();
    return { ok: approve ? "Approved. The reward is on their balance." : "Rejected. They can try again." };
  });
}

export async function setKitStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const status = text(fd, "status") as "requested" | "shipped" | "delivered";
    setKitStatus(text(fd, "id"), status, text(fd, "note"));
    await audit(admin, "kit_status", "kit_request", text(fd, "id"), { status });
    refresh();
    return { ok: `Marked ${status}.` };
  });
}

export async function rejectPayoutRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    rejectPayoutRequest(text(fd, "id"), text(fd, "note"));
    await audit(admin, "payout_request_reject", "payout_request", text(fd, "id"), {});
    refresh();
    return { ok: "Declined. They were told why." };
  });
}

export async function addResourceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    const f = fd.get("file");
    let stored = "", name = "", size = 0;
    if (f instanceof File && f.size > 0) {
      const r = await saveUpload("resources", f, { pdf: true, maxBytes: 12 * 1_048_576 });
      stored = r.stored; size = r.size; name = f.name;
    }
    addResource({ title: text(fd, "title"), description: text(fd, "description"), category: text(fd, "category"), url: text(fd, "url"), fileName: name, storedName: stored, size });
    await audit(admin, "resource_add", "resource", text(fd, "title"), {});
    refresh();
    return { ok: "Added. Ambassadors see it in Resources." };
  });
}

export async function deleteResourceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    deleteResource(text(fd, "id"));
    await audit(admin, "resource_delete", "resource", text(fd, "id"), {});
    refresh();
    return { ok: "Removed." };
  });
}

export async function addAnnouncementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    addAnnouncement(text(fd, "title"), text(fd, "body"));
    await audit(admin, "announcement_add", "announcement", text(fd, "title"), {});
    refresh();
    return { ok: "Posted. Every ambassador gets a notification." };
  });
}

export async function deleteAnnouncementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("affiliates.manage");
    deleteAnnouncement(text(fd, "id"));
    await audit(admin, "announcement_delete", "announcement", text(fd, "id"), {});
    refresh();
    return { ok: "Removed." };
  });
}

export async function saveApplicationNotesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    await requirePerm("affiliates.manage");
    saveApplicationNotes(text(fd, "id"), text(fd, "notes"));
    refresh();
    return { ok: "Notes saved." };
  });
}
