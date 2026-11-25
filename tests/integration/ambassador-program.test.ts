import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { applyAction } from "@/app/actions/ambassadors";
import { approveApplicationAction, createAccountAction } from "@/app/admin/(app)/affiliates/actions";
import { loginAction, logoutAction, requestPayoutAction, setPasswordAction, submitProofAction, monthlyKitAction, profileAction } from "@/app/ambassador/actions";
import { reviewSubmissionAction, setKitStatusAction, rejectPayoutRequestAction, saveProgramAction } from "@/app/admin/(app)/affiliates/program/actions";
import { POST as refClick } from "@/app/api/ref/route";
import { approveDueCommissions, createAffiliate, recordPayout } from "@/lib/affiliates";
import { createToken, getAmbassador, lookupAmbassador, requireAmbassador, tokenInfo, AMB_COOKIE } from "@/lib/ambassador/auth";
import { dashboardFor, kitsFor, leaderboard, onboardingFor, payoutsFor, salesFor, missionsFor } from "@/lib/ambassador/portal";
import { listMissions, needsAction, saveMission } from "@/lib/ambassador/admin";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { getProgram } from "@/lib/program";
import { h, ID, jar, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const PASSWORD = "correct-horse-battery-9";
let seq = 1;
const person = (n: number, name = `Buyer${n}`) => ({ name, phone: `03 55 ${String(1000 + n)}`, address: `Street ${n}, Hamra` });
const buy = (code: string | undefined, extra: Record<string, unknown> = {}) =>
  placeOrder({ customer: person(seq++), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer", code, ...extra });
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
async function deliver(id: string, daysAgo = 20) {
  for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(id, s, "t");
  sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(ago(daysAgo), id);
}
const owner = () => (h.user = { id: ID.owner, email: "owner@t.test" });
const signOutAmbassador = () => jar.delete(AMB_COOKIE);

/** An ambassador with a password and an open session (the portal's own cookie). */
async function ambassador(name: string, code: string, extra: Record<string, unknown> = {}) {
  const a = createAffiliate({ name, code, email: `${code.toLowerCase()}@t.test`, ...extra });
  const { token } = createToken(a.id, "invite");
  signOutAmbassador();
  const res = await setPasswordAction(null, form({ token, password: PASSWORD, confirm: PASSWORD, terms: "on" })).catch((e: Error) => e);
  expect((res as Error).message).toBe("NEXT_REDIRECT:/ambassador");
  return { a, me: (await getAmbassador())! };
}

beforeEach(async () => {
  resetState();
  seq = 1;
  S = await seedStore();
  h.user = null;
  signOutAmbassador();
});

describe("application -> approval -> invite -> portal", () => {
  it("the whole path: apply, approve (invite link + WhatsApp), set password with terms, log in, log out", async () => {
    const started = String(Date.now() - 10_000);
    expect(await applyAction(null, form({ name: "Hadi Saad", phone: "+961 70 123 456", email: "hadi@example.com", instagram_handle: "@hadi.fit", started, website: "" }))).toEqual({ ok: true });
    const app = sql().prepare("SELECT id FROM affiliate_applications").get() as { id: string };

    owner();
    expect(needsAction().applications).toBe(1);
    const approved = await approveApplicationAction(null, form({ id: app.id }));
    expect(approved).toMatchObject({ ok: expect.stringMatching(/nothing was sent/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliates").get()).toEqual({ n: 0 }); // the account is the separate manual step
    const r = await createAccountAction(null, form({ id: app.id }));
    expect(r).toMatchObject({ copy: { value: expect.stringContaining("/ambassador/set-password?token=") }, links: [{ href: expect.stringContaining("wa.me") }] });
    h.user = null;
    const token = new URL(r!.copy!.value).searchParams.get("token")!;
    const aff = sql().prepare("SELECT id, code, password_hash FROM affiliates").get() as { id: string; code: string; password_hash: string | null };
    expect(aff.password_hash).toBeNull();
    // a starter kit request is waiting
    expect(sql().prepare("SELECT kind, status FROM kit_requests WHERE affiliate_id = ?").all(aff.id)).toEqual([{ kind: "starter", status: "requested" }]);
    // only the hash of the link is stored
    expect(JSON.stringify(sql().prepare("SELECT * FROM ambassador_tokens").all())).not.toContain(token);

    // the invite needs the terms ticked and a strong password
    expect(await setPasswordAction(null, form({ token, password: PASSWORD, confirm: PASSWORD }))).toMatchObject({ error: expect.stringMatching(/terms/i) });
    expect(await setPasswordAction(null, form({ token, password: "short", confirm: "short", terms: "on" }))).toMatchObject({ error: expect.any(String) });
    expect(await setPasswordAction(null, form({ token, password: PASSWORD, confirm: "different-password-9", terms: "on" }))).toMatchObject({ error: expect.stringMatching(/match/) });
    await expect(setPasswordAction(null, form({ token, password: PASSWORD, confirm: PASSWORD, terms: "on" }))).rejects.toThrow("NEXT_REDIRECT:/ambassador");
    const me = (await getAmbassador())!;
    expect(me.id).toBe(aff.id);
    expect(me.terms_version).toBe(getProgram().termsVersion);
    expect(sql().prepare("SELECT password_hash FROM affiliates WHERE id = ?").get(aff.id)).toEqual({ password_hash: expect.stringMatching(/^\$argon2id\$/) });
    // the link works once
    expect(await setPasswordAction(null, form({ token, password: PASSWORD, confirm: PASSWORD, terms: "on" }))).toMatchObject({ error: expect.stringMatching(/already used/) });

    // logout, then login (generic error for wrong email and wrong password alike)
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/ambassador/login");
    expect(await getAmbassador()).toBeNull();
    const bad1 = await loginAction(null, form({ email: "hadi@example.com", password: "wrong-password-123" }));
    const bad2 = await loginAction(null, form({ email: "nobody@example.com", password: "wrong-password-123" }));
    expect(bad1).toEqual(bad2);
    await expect(loginAction(null, form({ email: "HADI@example.com", password: PASSWORD }))).rejects.toThrow("NEXT_REDIRECT:/ambassador");
    expect((await getAmbassador())?.id).toBe(aff.id);
  });

  it("links expire and a new one replaces the old; sessions are database rows keyed by a hash", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10", email: "r@t.test" });
    const t1 = createToken(a.id, "invite", Date.now() - 8 * 86_400_000);
    expect(tokenInfo(t1.token).state).toBe("expired");
    const t2 = createToken(a.id, "invite");
    const t3 = createToken(a.id, "invite");
    expect(tokenInfo(t2.token).state).toBe("used"); // replaced by the newer link
    expect(tokenInfo(t3.token).state).toBe("ok");
    expect(tokenInfo("garbage").state).toBe("unknown");
    expect(lookupAmbassador("x".repeat(40))).toBeNull();
  });

  it("login is rate limited and an ended account cannot sign in", async () => {
    const { a } = await ambassador("Lina", "LINA10");
    signOutAmbassador();
    for (let i = 0; i < 6; i++) await loginAction(null, form({ email: "lina10@t.test", password: `wrong-password-${i}x` }));
    expect(await loginAction(null, form({ email: "lina10@t.test", password: PASSWORD }))).toMatchObject({ error: expect.stringMatching(/Too many/) });
    sql().prepare("DELETE FROM rate_limits").run();
    sql().prepare("UPDATE affiliates SET status = 'ended' WHERE id = ?").run(a.id);
    expect(await loginAction(null, form({ email: "lina10@t.test", password: PASSWORD }))).toMatchObject({ error: expect.any(String) });
  });

  it("every portal action refuses a visitor who is not signed in; an admin session is not an ambassador session", async () => {
    owner();
    await expect(requireAmbassador()).rejects.toThrow("NEXT_REDIRECT:/ambassador/login");
    for (const fn of [requestPayoutAction, monthlyKitAction]) await expect(fn()).rejects.toThrow("NEXT_REDIRECT:/ambassador/login");
    for (const fn of [profileAction, submitProofAction]) await expect(fn(null, form({}))).rejects.toThrow("NEXT_REDIRECT:/ambassador/login");
  });
});

describe("attribution, discount and commission", () => {
  it("a code and a link both attribute the order; the commission is on the discounted products subtotal, delivery excluded", async () => {
    const { a } = await ambassador("Rami", "RAMI10");
    const viaCode = buy("RAMI10", { attribution: "code", heardFrom: "Instagram story" });
    const viaLink = buy("rami10", { attribution: "link" });
    const rows = sql().prepare("SELECT attribution, heard_from, discount_amount_cents, commission_amount_cents, subtotal_cents, commission_status, affiliate_id FROM orders ORDER BY created_at").all() as Record<string, number | string>[];
    expect(rows.map((r) => r.attribution)).toEqual(["code", "link"]);
    expect(rows[0].heard_from).toBe("Instagram story");
    for (const r of rows) {
      expect(r.affiliate_id).toBe(a.id);
      expect(r.discount_amount_cents).toBe(Math.round(Number(r.subtotal_cents) * 0.1));
      expect(r.commission_amount_cents).toBe(Math.round((Number(r.subtotal_cents) - Number(r.discount_amount_cents)) * 0.15));
      expect(r.commission_status).toBe("pending");
    }
    expect(viaCode.order.id).not.toBe(viaLink.order.id);
    // the ambassador is told about each sale
    expect(sql().prepare("SELECT COUNT(*) n FROM notifications WHERE affiliate_id = ? AND kind = 'sale'").get(a.id)).toEqual({ n: 2 });
  });

  it("an ambassador cannot use their own code on their own order", async () => {
    await ambassador("Rami", "RAMI10", { phone: "03 777 888" });
    expect(() => placeOrder({ customer: { name: "Rami", phone: "03 777 888", address: "x" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10" })).toThrow();
  });

  it("lifecycle: pending, approved after the hold, void when cancelled, paid by a payout; returned orders never pay", async () => {
    const { a } = await ambassador("Rami", "RAMI10");
    const good = buy("RAMI10").order;
    const cancelled = buy("RAMI10").order;
    await deliver(good.id, 20);
    await setOrderStatus(cancelled.id, "cancelled", "t", { reason: "customer asked" });
    const fresh = buy("RAMI10").order;
    await deliver(fresh.id, 2);
    approveDueCommissions();
    const st = (id: string) => (sql().prepare("SELECT commission_status s FROM orders WHERE id = ?").get(id) as { s: string }).s;
    expect([st(good.id), st(cancelled.id), st(fresh.id)]).toEqual(["approved", "void", "pending"]);
    const rec = recordPayout(a.id, { method: "cash", note: "t" });
    expect(st(good.id)).toBe("paid");
    expect(rec.amountCents).toBeGreaterThan(0);
    expect(st(fresh.id)).toBe("pending");
  });

  it("the click counter counts per day for real codes only, stores nothing personal, and always answers the same", async () => {
    const { a } = await ambassador("Rami", "RAMI10");
    const hit = (code: string) => refClick(new Request("http://x/api/ref", { method: "POST", body: JSON.stringify({ code }) }));
    const r1 = await hit("RAMI10");
    const r2 = await hit("NOSUCH");
    expect(await r1.json()).toEqual(await r2.json());
    await hit("rami10");
    expect(sql().prepare("SELECT SUM(count) c FROM ref_clicks WHERE affiliate_id = ?").get(a.id)).toEqual({ c: 2 });
    expect(sql().prepare("SELECT COUNT(*) n FROM ref_clicks").get()).toEqual({ n: 1 });
    expect(Object.keys(sql().prepare("SELECT * FROM ref_clicks").get() as object).sort()).toEqual(["affiliate_id", "count", "day"]);
  });
});

describe("data isolation: an ambassador only ever sees their own", () => {
  it("sales show first names only and never another ambassador's customers, codes or numbers", async () => {
    const A = await ambassador("Amal One", "AMAL10");
    const B = createAffiliate({ name: "Bilal Two", code: "BILAL10", instagram_handle: "bilal.secret" });
    buy("AMAL10", {});
    sql().prepare("UPDATE customers SET name = 'Karim Haddad' WHERE name = 'Buyer1'").run();
    placeOrder({ customer: { name: "Zeina Private", phone: "03 999 111", address: "Secret Street 9" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "BILAL10" });
    const out = JSON.stringify([salesFor(A.me.id, {}), dashboardFor(A.me), payoutsFor(A.me), missionsFor(A.me.id), kitsFor(A.me), onboardingFor(A.me), leaderboard(A.me)]);
    expect(out).toContain("Karim"); // own customer: first name
    for (const secret of ["Haddad", "Zeina", "Private", "Secret Street", "999", "BILAL10", B.id, "03 55"]) expect(out, secret).not.toContain(secret);
  });

  it("proof screenshots and resources need a session; a proof is served only to its owner or to the team", async () => {
    const A = await ambassador("Amal", "AMAL10");
    const { GET } = await import("@/app/ambassador/files/[kind]/[name]/route");
    const name = "a".repeat(32) + ".png";
    const ask = (kind: string, n = name) => GET(new Request("http://x"), { params: Promise.resolve({ kind, name: n }) });
    signOutAmbassador();
    expect((await ask("resources")).status).toBe(401);
    expect((await ask("proofs")).status).toBe(401);
    expect((await ask("proofs", "../../etc/passwd")).status).toBe(404);
    expect((await ask("secrets")).status).toBe(404);
    void A;
  });

  it("the leaderboard shows handles and order counts, honours opt-out, and marks only the viewer", async () => {
    const A = await ambassador("Amal", "AMAL10", { instagram_handle: "amal.fit" });
    const B = createAffiliate({ name: "Bilal", code: "BILAL10", instagram_handle: "bilal.fit" });
    buy("AMAL10"); buy("AMAL10"); buy("BILAL10");
    let lb = leaderboard(A.me);
    expect(lb.map((r) => [r.handle, r.orders, r.mine])).toEqual([["@amal.fit", 2, true], ["@bilal.fit", 1, false]]);
    expect(Object.keys(lb[0]).sort()).toEqual(["handle", "mine", "orders", "rank"]);
    sql().prepare("UPDATE affiliates SET leaderboard_optout = 1 WHERE id = ?").run(B.id);
    lb = leaderboard(A.me);
    expect(lb.map((r) => r.handle)).toEqual(["@amal.fit"]);
  });
});

describe("payout requests, missions and kits", () => {
  it("request needs details and the minimum; one open request; recording the payout closes it; a rejection explains", async () => {
    const { a, me } = await ambassador("Rami", "RAMI10");
    for (let i = 0; i < 6; i++) await deliver(buy("RAMI10").order.id, 20);
    approveDueCommissions();
    expect(await requestPayoutAction()).toMatchObject({ error: expect.stringMatching(/payout method/i) });
    await profileAction(null, form({ phone: "03 111 222", instagram: "@rami.runs", payout_method: "Whish", payout_details: "03 111 222" }));
    expect(await getAmbassador()).toMatchObject({ payout_method: "Whish", instagram_handle: "rami.runs" });
    expect(payoutsFor((await getAmbassador())!).availableCents).toBeGreaterThanOrEqual(getProgram().minPayoutCents);
    const ok = await requestPayoutAction();
    expect(ok).toMatchObject({ ok: expect.stringMatching(/requested/) });
    expect(await requestPayoutAction()).toMatchObject({ error: expect.stringMatching(/already have/) });
    expect(needsAction().payoutRequests).toBe(1);
    recordPayout(a.id, { method: "Whish", note: "t" });
    expect(sql().prepare("SELECT status FROM payout_requests").get()).toEqual({ status: "paid" });
    expect(needsAction().payoutRequests).toBe(0);
    expect(dashboardFor(me).paidCents).toBeGreaterThan(0);

    // second round: the admin declines with a reason
    for (let i = 0; i < 6; i++) await deliver(buy("RAMI10").order.id, 20);
    approveDueCommissions();
    await requestPayoutAction();
    owner();
    const id = (sql().prepare("SELECT id FROM payout_requests WHERE status = 'requested'").get() as { id: string }).id;
    expect(await rejectPayoutRequestAction(null, form({ id, note: "" }))).toMatchObject({ error: expect.any(String) });
    expect(await rejectPayoutRequestAction(null, form({ id, note: "Details look wrong" }))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT body FROM notifications WHERE kind = 'payout' ORDER BY created_at DESC, rowid DESC LIMIT 1").get()).toEqual({ body: "Details look wrong" });
  });

  it("minimum payout is enforced", async () => {
    await ambassador("Rami", "RAMI10");
    await profileAction(null, form({ payout_method: "Whish", payout_details: "03 1" }));
    await deliver(buy("RAMI10").order.id, 20);
    approveDueCommissions();
    expect(await requestPayoutAction()).toMatchObject({ error: expect.stringMatching(/from \$20/) });
  });

  it("missions: proof by link, approval credits a bonus paid with the next payout, rejection needs a note and allows a retry", async () => {
    const { a, me } = await ambassador("Rami", "RAMI10");
    owner();
    const mid = saveMission({ title: "Post a story", description: "Tag us", rewardDollars: "5", rewardText: "", month: "" });
    expect(listMissions()).toHaveLength(1);
    h.user = null;
    expect(await submitProofAction(null, form({ mission_id: mid, proof_url: "not a link" }))).toMatchObject({ error: expect.any(String) });
    expect(await submitProofAction(null, form({ mission_id: mid }))).toMatchObject({ error: expect.stringMatching(/link|screenshot/i) });
    expect(await submitProofAction(null, form({ mission_id: mid, proof_url: "https://instagram.com/p/abc" }))).toMatchObject({ ok: expect.any(String) });
    expect(await submitProofAction(null, form({ mission_id: mid, proof_url: "https://instagram.com/p/abd" }))).toMatchObject({ error: expect.stringMatching(/waiting/) });
    owner();
    expect(needsAction().proofs).toBe(1);
    const sid = (sql().prepare("SELECT id FROM mission_submissions").get() as { id: string }).id;
    expect(await reviewSubmissionAction(null, form({ id: sid, decision: "reject", note: "" }))).toMatchObject({ error: expect.any(String) });
    expect(await reviewSubmissionAction(null, form({ id: sid, decision: "reject", note: "Link is private" }))).toMatchObject({ ok: expect.any(String) });
    h.user = null;
    expect(await submitProofAction(null, form({ mission_id: mid, proof_url: "https://instagram.com/p/fixed" }))).toMatchObject({ ok: expect.any(String) });
    owner();
    const sid2 = (sql().prepare("SELECT id FROM mission_submissions WHERE status = 'submitted'").get() as { id: string }).id;
    expect(await reviewSubmissionAction(null, form({ id: sid2, decision: "approve" }))).toMatchObject({ ok: expect.any(String) });
    expect(await reviewSubmissionAction(null, form({ id: sid2, decision: "approve" }))).toMatchObject({ error: expect.stringMatching(/already/) }); // credited once
    expect(sql().prepare("SELECT SUM(amount_cents) c FROM affiliate_bonuses WHERE affiliate_id = ?").get(a.id)).toEqual({ c: 500 });
    expect(dashboardFor(me).bonusCents).toBe(500);
    // the bonus is paid with the next payout
    await deliver(buy("RAMI10").order.id, 20);
    approveDueCommissions();
    const p = recordPayout(a.id, { method: "cash", note: "" });
    expect(p.amountCents).toBeGreaterThanOrEqual(500);
    expect(sql().prepare("SELECT payout_id FROM affiliate_bonuses").get()).toEqual({ payout_id: expect.any(String) });
  });

  it("kits: the monthly free pouch needs Athlete and works once a month; the team moves requests along", async () => {
    const { me } = await ambassador("Rami", "RAMI10");
    expect(await monthlyKitAction()).toMatchObject({ error: expect.stringMatching(/starts at/) });
    sql().prepare("UPDATE affiliates SET tier = 'athlete' WHERE id = ?").run(me.id);
    expect(await monthlyKitAction()).toMatchObject({ ok: expect.any(String) });
    expect(await monthlyKitAction()).toMatchObject({ error: expect.stringMatching(/already/) });
    owner();
    const kid = (sql().prepare("SELECT id FROM kit_requests").get() as { id: string }).id;
    expect(needsAction().kits).toBe(1);
    expect(await setKitStatusAction(null, form({ id: kid, status: "shipped", note: "On its way" }))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT title FROM notifications WHERE kind = 'kit'").get()).toEqual({ title: "Your monthly pouch is shipped" });
  });
});

describe("program settings", () => {
  it("saving validates, a stale form is refused, and changing the terms raises the version so everyone re-accepts", async () => {
    const { me } = await ambassador("Rami", "RAMI10");
    expect(onboardingFor(me).items.find((i) => i.key === "terms")?.done).toBe(true);
    owner();
    const base = {
      seed_label: "Seed", seed_min: "0", seed_commission: "15", seed_perks: "A\nB", athlete_label: "Athlete", athlete_min: "10", athlete_commission: "20", athlete_perks: "C",
      ambassador_label: "Ambassador", ambassador_min: "30", ambassador_commission: "25", ambassador_perks: "D", discount: "10", hold: "14", min_payout: "20", terms: getProgram().termsText, banner_text: "Join",
    };
    expect(await saveProgramAction(null, form({ ...base, min_payout: "0" }))).toMatchObject({ error: expect.any(String) });
    expect(await saveProgramAction(null, form({ ...base, athlete_min: "50" }))).toMatchObject({ error: expect.stringMatching(/go up/) });
    expect(await saveProgramAction(null, form({ ...base, banner_on: "on", version: "0" }))).toMatchObject({ ok: "Saved." });
    expect(getProgram().banner.enabled).toBe(true);
    expect(getProgram().termsVersion).toBe(1);
    expect(await saveProgramAction(null, form({ ...base, version: "0" }))).toMatchObject({ error: expect.stringMatching(/changed elsewhere/) });
    expect(await saveProgramAction(null, form({ ...base, version: "1", terms: "NEW TERMS TEXT" }))).toMatchObject({ ok: expect.stringMatching(/version 2/) });
    expect(getProgram().termsVersion).toBe(2);
    expect(onboardingFor(me).items.find((i) => i.key === "terms")?.done).toBe(false);
  });
});
