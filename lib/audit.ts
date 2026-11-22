import "server-only";
import { getDb } from "./db";
import { publish } from "./events";
import type { Admin } from "./roles";

/** Record an important change. Never throws (auditing must not break the action). */
export async function audit(
  admin: Pick<Admin, "id" | "email"> | null,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  try {
    await getDb().from("audit_log").insert({
      actor_id: admin?.id ?? null,
      actor_email: admin?.email ?? "system",
      action,
      entity,
      entity_id: entityId,
      details,
    });
    publish({ type: "kpi.refresh" }); // every audited change (product, discount, settings, stock...) refreshes open admin lists and dashboards live
  } catch {}
}
