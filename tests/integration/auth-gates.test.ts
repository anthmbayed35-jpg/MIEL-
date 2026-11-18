import path from "node:path";
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createLocalClient } = await import("../support/local-db");
  return {
    getDb: () => createLocalClient(),
    hasSupabase: () => true,
    dbMode: () => "supabase",
    usesDb: () => true,
    must: (r: any) => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
  };
});
vi.mock("@/lib/supabase-server", async () => {
  const { fakeAuthClient, fakeAdminAuth } = await import("../support/state");
  return { authClient: async () => fakeAuthClient(), adminAuthClient: () => fakeAdminAuth() };
});
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
  forbidden: () => {
    throw new Error("HTTP_403");
  },
  unauthorized: () => {
    throw new Error("HTTP_401");
  },
  notFound: () => {
    throw new Error("HTTP_404");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [] }),
}));

import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const ROOT = path.resolve(__dirname, "../..");
type Min = "any" | "manager" | "owner";

/**
 * THE ROLE MATRIX for every server action. A new action that isn't listed here fails the test below,
 * so nobody can add an unclassified action by accident.
 */
const MATRIX: Record<string, Min> = {
  // orders
  "orders/actions::changeStatus": "any", "orders/actions::bulkStatus": "any", "orders/actions::toggleCod": "any", "orders/actions::saveDelivery": "any",
  "orders/actions::addComment": "any", "orders/actions::cancelOrder": "any", "orders/actions::returnOrder": "any", "orders/actions::createManualOrder": "any",
  // inventory, customers
  "inventory/actions::adjustStock": "any", "inventory/actions::setThreshold": "any", "inventory/actions::addBatch": "any", "inventory/actions::receiveBatch": "any",
  "customers/actions::saveCustomer": "any", "customers/actions::toggleBlock": "manager",
  // products
  "products/actions::saveProduct": "manager", "products/actions::archiveProduct": "manager", "products/actions::uploadImage": "manager",
  "products/actions::updateImage": "manager", "products/actions::moveImage": "manager", "products/actions::deleteImage": "owner",
  // marketing & content
  "marketing/actions::saveDiscount": "manager", "marketing/actions::toggleDiscount": "manager", "marketing/actions::markContacted": "manager",
  "marketing/actions::saveTracking": "manager", "marketing/actions::saveAnnouncement": "manager", "marketing/actions::saveHero": "manager",
  "marketing/actions::saveFaq": "manager", "marketing/actions::addTestimonial": "manager", "marketing/actions::setTestimonial": "manager",
  // shipping
  "settings/shipping/actions::saveZone": "manager", "settings/shipping/actions::savePartner": "manager", "settings/shipping/actions::settlePartner": "manager",
  // settings & team: owner only
  "settings/actions::seedStoreAction": "owner", "settings/actions::saveStore": "owner", "settings/actions::saveNotifications": "owner",
  "settings/actions::savePolicies": "owner", "settings/actions::saveSecurity": "owner",
  "settings/team/actions::inviteMember": "owner", "settings/team/actions::setRole": "owner", "settings/team/actions::setActive": "owner", "settings/team/actions::sendReset": "owner",
  // any signed-in team member (their own account)
  "account/actions::changePassword": "any",
};
const PUBLIC = new Set(["login/actions::login", "login/actions::requestReset", "auth/confirm/actions::confirmLink"]);
// Safe with or without a session (they only END a session)
const SESSION = new Set(["login/actions::logout", "login/actions::logoutEverywhere"]);

function actionFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "actions.ts") out.push(p);
    }
  };
  walk(path.join(ROOT, "app/admin"));
  return out;
}
const key = (file: string, fn: string) => `${path.relative(path.join(ROOT, "app/admin"), file).replace(/\\/g, "/").replace(/^\(app\)\//, "").replace(/\.ts$/, "")}::${fn}`;

async function allActions() {
  const list: { key: string; fn: (...a: any[]) => Promise<any> }[] = [];
  for (const file of actionFiles()) {
    const mod = await import(/* @vite-ignore */ file.replace(/\\/g, "/"));
    for (const [name, fn] of Object.entries(mod)) if (typeof fn === "function") list.push({ key: key(file, name), fn: fn as any });
  }
  return list;
}

const call = (fn: (...a: any[]) => Promise<any>, k: string) => {
  const fd = new FormData();
  if (k.endsWith("setTestimonial")) fd.set("act", "approve"); // approve/hide is manager+; removing is owner-only (tested below)
  return fn(null, fd).then(
    (r: unknown) => ({ ok: true as const, r }),
    (e: Error) => ({ ok: false as const, e: e.message }),
  );
};

beforeEach(async () => {
  resetState();
  await seedStore();
});

describe("action matrix is complete", () => {
  it("every server action is classified (so none can be added unguarded)", async () => {
    const keys = (await allActions()).map((a) => a.key).sort();
    const known = [...Object.keys(MATRIX), ...PUBLIC, ...SESSION].sort();
    // actions in the (flow) group are covered by auth-flows tests (they use getAdminState)
    const unclassified = keys.filter((k) => !known.includes(k) && !k.startsWith("(flow)/"));
    expect(unclassified).toEqual([]);
    const stale = Object.keys(MATRIX).filter((k) => !keys.includes(k));
    expect(stale).toEqual([]);
  });
});

describe("not signed in: every protected action answers 401 and does nothing", () => {
  it("rejects all of them", async () => {
    h.user = null;
    for (const a of await allActions()) {
      if (PUBLIC.has(a.key) || SESSION.has(a.key) || a.key.startsWith("(flow)/")) continue;
      const res = await call(a.fn, a.key);
      expect(res.ok, `${a.key} should not succeed without a session`).toBe(false);
      expect((res as any).e, a.key).toBe("HTTP_401");
    }
  });
  it("a valid Supabase account that is not on the team is also 401", async () => {
    h.user = { id: ID.stranger, email: "stranger@t.test" };
    const a = (await allActions()).find((x) => x.key === "orders/actions::changeStatus")!;
    expect((await call(a.fn, a.key)) as never).toMatchObject({ ok: false, e: "HTTP_401" });
  });
  it("a deactivated team member is 401", async () => {
    const { db } = await seedStore().catch(() => ({ db: null as any }));
    void db;
    const { createLocalClient } = await import("../support/local-db");
    await (createLocalClient() as any).from("admin_users").update({ active: false }).eq("id", ID.staff);
    h.user = { id: ID.staff, email: "staff@t.test" };
    const a = (await allActions()).find((x) => x.key === "orders/actions::changeStatus")!;
    expect((await call(a.fn, a.key)) as never).toMatchObject({ ok: false, e: "HTTP_401" });
  });
});

describe("role enforcement on the server (every action, every role)", () => {
  const roles = [
    ["staff", ID.staff, "staff@t.test"],
    ["manager", ID.manager, "manager@t.test"],
    ["owner", ID.owner, "owner@t.test"],
  ] as const;
  const rank = { staff: 0, manager: 1, owner: 2 } as const;
  const need = { any: 0, manager: 1, owner: 2 } as const;

  for (const [role, id, email] of roles) {
    it(`${role}: allowed exactly what the matrix says, 403 for the rest`, async () => {
      h.user = { id, email };
      for (const a of await allActions()) {
        const min = MATRIX[a.key];
        if (!min) continue;
        const res = await call(a.fn, a.key);
        const allowed = rank[role] >= need[min];
        if (allowed) expect(String((res as any).e ?? ""), `${role} should be allowed ${a.key}`).not.toMatch(/^HTTP_40[13]$/);
        else expect(String((res as any).e ?? ""), `${role} must get 403 on ${a.key}`).toBe("HTTP_403");
      }
    });
  }

  it("staff cannot promote themselves, even by crafting the request", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    const mod = await import("@/app/admin/(app)/settings/team/actions");
    const fd = new FormData();
    fd.set("id", ID.staff);
    fd.set("role", "owner");
    await expect(mod.setRole(null, fd)).rejects.toThrow("HTTP_403");
    const { createLocalClient } = await import("../support/local-db");
    const row = ((await (createLocalClient() as any).from("admin_users").select("*").eq("id", ID.staff).single()).data);
    expect(row.role).toBe("staff");
  });
});

describe("deleting is owner-only", () => {
  const remove = async () => {
    const mod = await import("@/app/admin/(app)/marketing/actions");
    const fd = new FormData();
    fd.set("act", "remove");
    fd.set("id", "x");
    return mod.setTestimonial(null, fd);
  };
  it("manager and staff cannot remove a testimonial", async () => {
    h.user = { id: ID.manager, email: "manager@t.test" };
    await expect(remove()).rejects.toThrow("HTTP_403");
    h.user = { id: ID.staff, email: "staff@t.test" };
    await expect(remove()).rejects.toThrow("HTTP_403");
  });
  it("the owner can", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    await expect(remove()).resolves.toBeTruthy();
  });
});

describe("two-factor state", () => {
  it("enrolled but not yet verified this session: treated as not signed in by APIs, sent to the 2FA step by pages", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    h.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    const auth = await import("@/lib/auth");
    expect(await auth.getAdmin()).toBeNull();
    await expect(auth.requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
    const mod = await import("@/app/admin/(app)/orders/actions");
    await expect(mod.changeStatus(null, new FormData())).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
  });
  it("verified (aal2): fully signed in", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    h.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    const auth = await import("@/lib/auth");
    expect((await auth.getAdmin())?.role).toBe("owner");
  });
  it("when the owner requires 2FA, someone without it must set it up first", async () => {
    const { createLocalClient } = await import("../support/local-db");
    await (createLocalClient() as any).from("settings").insert({ key: "security", value: { require_2fa: true } });
    h.user = { id: ID.staff, email: "staff@t.test" };
    const auth = await import("@/lib/auth");
    expect(await auth.getAdmin()).toBeNull();
    await expect(auth.requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/mfa");
    expect((await auth.getAdminState())?.mfa).toBe("enroll");
  });
});
