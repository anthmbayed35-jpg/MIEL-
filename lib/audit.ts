import "server-only";
import { getDb } from "./db";
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
      actor_id: admin && /^[0-9a-f-]{36}$/.test(admin.id) ? admin.id : null,
      actor_email: admin?.email ?? "system",
      action,
      entity,
      entity_id: entityId,
      details,
    });
  } catch {}
}
