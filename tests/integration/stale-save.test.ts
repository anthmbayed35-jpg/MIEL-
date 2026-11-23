import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { currentVersion, STALE_MESSAGE } from "@/lib/versioned";
import { saveAnnouncement, saveFaq, saveHero, saveTracking } from "@/app/admin/(app)/marketing/actions";
import { saveNotifications, savePolicies, saveSecurity, saveStore } from "@/app/admin/(app)/settings/actions";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const value = (table: string, key: string) => JSON.parse((sql().prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key) as { value: string }).value);

beforeEach(async () => {
  resetState();
  await seedStore();
  sql().prepare("DELETE FROM settings").run();
  sql().prepare("DELETE FROM pages_content").run();
  h.user = { id: ID.owner, email: "owner@t.test" };
});

type Case = { name: string; table: "settings" | "pages_content"; key: string; save: (fd: FormData) => Promise<unknown>; fields: (n: "A" | "B") => Record<string, string>; read: () => unknown; a: unknown; b: unknown };
const CASES: Case[] = [
  { name: "store details", table: "settings", key: "store", save: (fd) => saveStore(null, fd), fields: (n) => ({ name: `Store ${n}`, whatsapp: "96170123456", cod_enabled: "on" }), read: () => value("settings", "store").name, a: "Store A", b: "Store B" },
  { name: "notifications", table: "settings", key: "notifications", save: (fd) => saveNotifications(null, fd), fields: (n) => ({ email: `${n.toLowerCase()}@t.test` }), read: () => value("settings", "notifications").email, a: "a@t.test", b: "b@t.test" },
  { name: "policies", table: "settings", key: "policies", save: (fd) => savePolicies(null, fd), fields: (n) => ({ shipping: `Shipping ${n}` }), read: () => value("settings", "policies").shipping, a: "Shipping A", b: "Shipping B" },
  { name: "security", table: "settings", key: "security", save: (fd) => saveSecurity(null, fd), fields: (n): Record<string, string> => (n === "B" ? { require_2fa: "on" } : {}), read: () => value("settings", "security").require_2fa, a: false, b: true },
  { name: "tracking ids", table: "settings", key: "tracking", save: (fd) => saveTracking(null, fd), fields: (n) => ({ meta_pixel_id: n === "A" ? "111111111" : "222222222" }), read: () => value("settings", "tracking").meta_pixel_id, a: "111111111", b: "222222222" },
  { name: "announcement bar", table: "pages_content", key: "announcement", save: (fd) => saveAnnouncement(null, fd), fields: (n) => ({ text: `Bar ${n}`, enabled: "on" }), read: () => value("pages_content", "announcement").text, a: "Bar A", b: "Bar B" },
  { name: "home hero text", table: "pages_content", key: "hero", save: (fd) => saveHero(null, fd), fields: (n) => ({ headline1: `Hero ${n}`, headline2: "x", sub: "y" }), read: () => value("pages_content", "hero").headline1, a: "Hero A", b: "Hero B" },
  { name: "FAQ", table: "pages_content", key: "faq", save: (fd) => saveFaq(null, fd), fields: (n) => ({ faq: `Question ${n}?|Answer ${n}` }), read: () => value("pages_content", "faq")[0].q, a: "Question A?", b: "Question B?" },
];

describe("two tabs: a stale save of a settings or content form is refused, never a silent overwrite", () => {
  for (const c of CASES)
    it(`${c.name}`, async () => {
      // both tabs open on a record that does not exist yet (version 0)
      const tabA = { version: String(currentVersion(c.table, c.key)) };
      const tabB = { version: String(currentVersion(c.table, c.key)) };
      expect(tabA.version).toBe("0");
      const a = (await c.save(form({ ...c.fields("A"), ...tabA }))) as { ok?: string; error?: string } | null;
      expect(a?.error).toBeUndefined();
      expect(c.read()).toEqual(c.a);
      const versionAfterA = currentVersion(c.table, c.key);
      expect(versionAfterA).toBe(1);
      // tab B still has version 0: its save must be refused with the clear message and change nothing
      const b = (await c.save(form({ ...c.fields("B"), ...tabB }))) as { error?: string } | null;
      expect(b?.error).toBe(STALE_MESSAGE);
      expect(c.read()).toEqual(c.a); // tab A's save is still there
      expect(currentVersion(c.table, c.key)).toBe(versionAfterA);
      // after reloading (the current version) the same edit is accepted and the version moves on
      const ok = (await c.save(form({ ...c.fields("B"), version: String(versionAfterA) }))) as { error?: string } | null;
      expect(ok?.error).toBeUndefined();
      expect(currentVersion(c.table, c.key)).toBe(versionAfterA + 1);
      expect(c.read()).toEqual(c.b);
    });

  it("a garbage or negative version never matches", async () => {
    await saveHero(null, form({ headline1: "one", headline2: "x", sub: "y", version: "0" }));
    for (const bad of ["abc", "-1", "1.5", "99999999999999999999", "NaN"]) {
      const r = await saveHero(null, form({ headline1: "hacked", headline2: "x", sub: "y", version: bad }));
      expect(r, bad).toMatchObject({ error: STALE_MESSAGE });
    }
    expect(value("pages_content", "hero").headline1).toBe("one");
  });

  it("two saves from the same version at the same moment: exactly one wins", async () => {
    const results = await Promise.all([
      saveStore(null, form({ name: "First", version: "0" })),
      saveStore(null, form({ name: "Second", version: "0" })),
      saveStore(null, form({ name: "Third", version: "0" })),
    ]);
    expect(results.filter((r) => r && "ok" in r && r.ok)).toHaveLength(1);
    expect(results.filter((r) => r && "error" in r && r.error === STALE_MESSAGE)).toHaveLength(2);
    expect(currentVersion("settings", "store")).toBe(1);
  });

  it("the form that is shown carries the version it was opened on, and it moves after a save", async () => {
    const render = async (load: () => Promise<{ default: (p: never) => unknown }>) => renderToStaticMarkup((await (await load()).default({ searchParams: Promise.resolve({}) } as never)) as never);
    const versionsIn = (html: string) => [...html.matchAll(/name="version" value="(\d+)"/g)].map((m) => Number(m[1]));
    const before = await render(() => import("@/app/admin/(app)/settings/page"));
    expect(versionsIn(before).length).toBeGreaterThanOrEqual(4); // store, notifications, policies, security
    expect(new Set(versionsIn(before))).toEqual(new Set([0]));
    await saveStore(null, form({ name: "MIEL+", version: "0" }));
    const after = await render(() => import("@/app/admin/(app)/settings/page"));
    expect(versionsIn(after)).toContain(1);
    const content = await render(() => import("@/app/admin/(app)/marketing/content/page"));
    expect(versionsIn(content).length).toBeGreaterThanOrEqual(3); // announcement, hero, faq
  });

  it("a direct call without any version (not from a form) is still accepted, and still bumps the version", async () => {
    await saveHero(null, form({ headline1: "direct", headline2: "x", sub: "y" }));
    expect(value("pages_content", "hero").headline1).toBe("direct");
    expect(currentVersion("pages_content", "hero")).toBe(1);
  });
});
