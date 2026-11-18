export type Role = "owner" | "manager" | "staff";

/**
 * Permission -> roles allowed. Enforced in server code on every page, action and route (requirePerm / getAdmin),
 * and mirrored by row-level security in supabase/migrations.
 *  - staff:   day-to-day work (orders, customers, inventory). No pricing, discounts, exports, settings or team.
 *  - manager: everything operational, but cannot touch team/settings or DELETE data.
 *  - owner:   everything, including settings, team and deletion.
 */
export const PERMS = {
  "orders.read": ["owner", "manager", "staff"],
  "orders.write": ["owner", "manager", "staff"],
  "customers.read": ["owner", "manager", "staff"],
  "customers.write": ["owner", "manager", "staff"],
  "customers.block": ["owner", "manager"],
  "inventory.read": ["owner", "manager", "staff"],
  "inventory.write": ["owner", "manager", "staff"],
  "products.read": ["owner", "manager", "staff"],
  "products.write": ["owner", "manager"],
  "discounts.manage": ["owner", "manager"],
  "shipping.manage": ["owner", "manager"],
  "marketing.manage": ["owner", "manager"],
  "analytics.read": ["owner", "manager"],
  "content.manage": ["owner", "manager"],
  "audit.read": ["owner", "manager"],
  "settings.read": ["owner", "manager"],
  "settings.write": ["owner"],
  "team.manage": ["owner"],
  /** CSV exports (orders, customers, analytics). */
  "exports.run": ["owner", "manager"],
  /** Permanently removing things (images, testimonials). Everything else is archived or disabled. */
  "data.delete": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Perm = keyof typeof PERMS;
export const can = (role: Role | undefined, perm: Perm) => !!role && (PERMS[perm] as readonly Role[]).includes(role);

export type Admin = { id: string; email: string; name: string; role: Role };
