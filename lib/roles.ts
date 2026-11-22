export type Role = "owner" | "manager" | "staff";

/**
 * Permission -> roles allowed. Enforced in server code on every page, action and route (requirePerm / getAdmin),
 * There is no database-level security: the database file is only reachable from server code, so these checks ARE the access control.
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
  /** Influencer affiliates: view, create/edit, record payouts, handle applications, export. */
  "affiliates.read": ["owner", "manager"],
  "affiliates.manage": ["owner", "manager"],
  "analytics.read": ["owner", "manager"],
  "content.manage": ["owner", "manager"],
  "audit.read": ["owner", "manager"],
  "settings.read": ["owner", "manager"],
  "settings.write": ["owner"],
  "team.manage": ["owner"],
  /** Download the database + uploads as a zip (customer data: owner only). */
  "backup.download": ["owner"],
  /** CSV exports (orders, customers, analytics). */
  "exports.run": ["owner", "manager"],
  /** Permanently removing things (images, testimonials). Everything else is archived or disabled. */
  "data.delete": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Perm = keyof typeof PERMS;
export const can = (role: Role | undefined, perm: Perm) => !!role && (PERMS[perm] as readonly Role[]).includes(role);

export type Admin = { id: string; email: string; name: string; role: Role };

const RANK = { staff: 0, manager: 1, owner: 2 } as const;
/**
 * Nobody can hand out a role higher than their own. (Creating members and invites is owner-only today, so this is the
 * second lock: it keeps holding if the permission is ever widened to managers.)
 */
export const canGrantRole = (actor: Role | undefined, target: Role): boolean => !!actor && actor in RANK && target in RANK && RANK[actor] >= RANK[target];
export const ROLE_NAMES: readonly Role[] = ["owner", "manager", "staff"];
