import "server-only";
import crypto from "node:crypto";
import { affiliateStats, approveDueCommissions } from "../affiliates";
import { getEngine } from "../db";
import { publish } from "../events";
import { getProgram } from "../program";
import { monthRange, zonedParts } from "../time";
import type { Ambassador } from "./auth";
import { notifyAmbassador } from "./notify";

/**
 * Everything the ambassador portal reads and writes. EVERY function takes the signed-in ambassador's id (from lib/ambassador/auth.ts,
 * never from the browser) and every query is scoped by it: there is no way to ask for someone else's data. Customers appear by first
 * name only; no phone, address, email or notes ever leave this module.
 */
const sql = () => getEngine().sqlite;
const VALID = "o.status NOT IN ('cancelled','returned','draft') AND o.is_test = 0";
const now = () => new Date().toISOString();
const ORDER = ["seed", "athlete", "ambassador"] as const;

const currentMonth = (at = new Date()) => {
  const { y, m } = zonedParts(at);
  return `${y}-${String(m).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- dashboard
export type Dashboard = ReturnType<typeof dashboardFor>;
export function dashboardFor(me: Ambassador, at = new Date()) {
  approveDueCommissions(at); // statuses are always current when the page is drawn
  const s = affiliateStats(me.id)!;
  const program = getProgram();
  const { from, to } = monthRange(currentMonth(at));
  const month = sql().prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(o.subtotal_cents - o.discount_amount_cents), 0) AS sales_cents FROM orders o WHERE o.affiliate_id = ? AND ${VALID} AND o.created_at >= ? AND o.created_at < ?`).get(me.id, from.toISOString(), to.toISOString()) as { orders: number; sales_cents: number };
  const bonus = (sql().prepare("SELECT COALESCE(SUM(amount_cents), 0) AS c FROM affiliate_bonuses WHERE affiliate_id = ? AND payout_id IS NULL").get(me.id) as { c: number }).c;
  const requested = (sql().prepare("SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payout_requests WHERE affiliate_id = ? AND status = 'requested'").get(me.id) as { c: number }).c;
  const clicksAll = (sql().prepare("SELECT COALESCE(SUM(count), 0) AS c FROM ref_clicks WHERE affiliate_id = ?").get(me.id) as { c: number }).c;
  const clicksMonth = (sql().prepare("SELECT COALESCE(SUM(count), 0) AS c FROM ref_clicks WHERE affiliate_id = ? AND day >= ? AND day <= ?").get(me.id, `${currentMonth(at)}-01`, `${currentMonth(at)}-31`) as { c: number }).c;
  const available = Math.max(0, s.approved_cents + bonus - s.corrections_cents - requested);
  const idx = ORDER.indexOf(me.tier);
  const next = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const cur = program.tiers[me.tier];
  const nextTier = next ? program.tiers[next] : null;
  const progress = nextTier ? { next: nextTier.label, need: Math.max(0, nextTier.minDelivered - s.delivered), have: s.delivered, target: nextTier.minDelivered, from: cur.minDelivered, percent: Math.min(100, Math.round(((s.delivered - cur.minDelivered) / Math.max(1, nextTier.minDelivered - cur.minDelivered)) * 100)) } : null;
  return {
    tier: cur.label, tierKey: me.tier, commissionPercent: me.commission_rate_x100 / 100, discountPercent: me.customer_discount_percent_x100 / 100, progress,
    delivered: s.delivered, orders: s.orders, salesCents: s.sales_cents, monthOrders: month.orders, monthSalesCents: month.sales_cents,
    pendingCents: s.pending_cents, approvedCents: s.approved_cents, paidCents: s.paid_cents, correctionsCents: s.corrections_cents, bonusCents: bonus,
    requestedCents: requested, availableCents: available, clicks: clicksAll, clicksMonth, conversion: clicksAll > 0 ? Math.round((s.orders / clicksAll) * 1000) / 10 : null,
    minPayoutCents: program.minPayoutCents, holdDays: program.holdDays,
  };
}

/** The checklist at the top of the portal until everything is done. */
export function onboardingFor(me: Ambassador) {
  const program = getProgram();
  const kit = sql().prepare("SELECT status FROM kit_requests WHERE affiliate_id = ? AND kind = 'starter' ORDER BY created_at DESC LIMIT 1").get(me.id) as { status: string } | undefined;
  const items = [
    { key: "terms", label: "Accept the ambassador terms", done: me.terms_version === program.termsVersion, href: "/ambassador/profile#terms" },
    { key: "payout", label: "Add your payout details", done: !!me.payout_method.trim() && !!me.payout_details.trim(), href: "/ambassador/profile#payout" },
    { key: "instagram", label: "Add your Instagram handle", done: !!me.instagram_handle.trim(), href: "/ambassador/profile#details" },
    { key: "kit", label: kit ? `Your starter kit: ${kit.status}` : "Your starter kit", done: kit?.status === "delivered", href: "/ambassador/kit" },
    { key: "rules", label: "Read the rules", done: !!me.rules_read_at, href: "/ambassador/resources#rules" },
  ];
  return { items, done: items.every((i) => i.done) };
}

// ---------------------------------------------------------------- sales
export type SaleRow = { order_number: number; created_at: string; products: string; first_name: string; total_cents: number; commission_cents: number; commission_status: string | null; order_status: string; via: string | null };
export const SALES_PAGE = 20;
export function salesFor(id: string, f: { month?: string; status?: string; page?: number }) {
  const where = ["o.affiliate_id = ?", "o.is_test = 0", "o.status <> 'draft'"];
  const p: unknown[] = [id];
  if (f.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) {
    const { from, to } = monthRange(f.month);
    where.push("o.created_at >= ? AND o.created_at < ?");
    p.push(from.toISOString(), to.toISOString());
  }
  if (f.status && ["pending", "approved", "paid", "void"].includes(f.status)) {
    where.push("o.commission_status = ?");
    p.push(f.status);
  }
  const W = where.join(" AND ");
  const total = (sql().prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${W}`).get(...p) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / SALES_PAGE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const rows = sql().prepare(
    `SELECT o.order_number, o.created_at, o.status AS order_status, o.total_cents, o.commission_amount_cents AS commission_cents, o.commission_status, o.attribution AS via,
            (SELECT group_concat(oi.name || ' x' || oi.qty, ', ') FROM order_items oi WHERE oi.order_id = o.id) AS products,
            CASE WHEN instr(c.name, ' ') > 0 THEN substr(c.name, 1, instr(c.name, ' ') - 1) ELSE COALESCE(c.name, '') END AS first_name
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE ${W} ORDER BY o.created_at DESC LIMIT ${SALES_PAGE} OFFSET ${(page - 1) * SALES_PAGE}`,
  ).all(...p) as SaleRow[];
  const months = (sql().prepare("SELECT DISTINCT substr(created_at, 1, 7) AS m FROM orders WHERE affiliate_id = ? AND is_test = 0 AND status <> 'draft' ORDER BY m DESC LIMIT 18").all(id) as { m: string }[]).map((r) => r.m);
  return { rows, total, page, pages, months };
}

// ---------------------------------------------------------------- payouts
export function payoutsFor(me: Ambassador, at = new Date()) {
  const d = dashboardFor(me, at);
  const history = sql().prepare("SELECT amount_cents, gross_cents, corrections_cents, method, note, paid_at FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY paid_at DESC, rowid DESC").all(me.id) as { amount_cents: number; gross_cents: number; corrections_cents: number; method: string; note: string; paid_at: string }[];
  const requests = sql().prepare("SELECT amount_cents, status, note, created_at, decided_at FROM payout_requests WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 20").all(me.id) as { amount_cents: number; status: string; note: string; created_at: string; decided_at: string | null }[];
  const open = requests.find((r) => r.status === "requested");
  return { ...d, history, requests, open, canRequest: !open && d.availableCents >= d.minPayoutCents && !!me.payout_method.trim() && !!me.payout_details.trim() };
}

/** Ask for the whole available balance. One open request at a time, the minimum applies, and payout details must be on file. */
export function requestPayout(me: Ambassador): number {
  const amount = getEngine().tx(() => {
    const d = dashboardFor(me);
    if (!me.payout_method.trim() || !me.payout_details.trim()) throw new Error("Add your payout method and details first (Profile).");
    if (sql().prepare("SELECT 1 FROM payout_requests WHERE affiliate_id = ? AND status = 'requested'").get(me.id)) throw new Error("You already have a payout request waiting.");
    if (d.availableCents < d.minPayoutCents) throw new Error(`You can request a payout from $${(d.minPayoutCents / 100).toFixed(2)} of approved balance.`);
    sql().prepare("INSERT INTO payout_requests (id, affiliate_id, amount_cents) VALUES (?, ?, ?)").run(crypto.randomUUID(), me.id, d.availableCents);
    return d.availableCents;
  });
  publish({ type: "kpi.refresh" });
  return amount;
}

// ---------------------------------------------------------------- missions
export type MissionView = { id: string; title: string; description: string; reward_cents: number; reward_text: string; month: string; status: string; mine: { status: string; admin_note: string; proof_url: string; has_file: number; created_at: string } | null };
export function missionsFor(id: string): MissionView[] {
  const missions = sql().prepare("SELECT id, title, description, reward_cents, reward_text, month, status FROM missions WHERE status = 'active' OR id IN (SELECT mission_id FROM mission_submissions WHERE affiliate_id = ?) ORDER BY (status = 'active') DESC, created_at DESC LIMIT 60").all(id) as Omit<MissionView, "mine">[];
  return missions.map((m) => ({
    ...m,
    mine: (sql().prepare("SELECT status, admin_note, proof_url, (proof_file <> '') AS has_file, created_at FROM mission_submissions WHERE mission_id = ? AND affiliate_id = ? ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, created_at DESC LIMIT 1").get(m.id, id) as MissionView["mine"]) ?? null,
  }));
}

export function submitProof(id: string, missionId: string, proofUrl: string, proofFile: string) {
  const url = proofUrl.trim();
  if (!url && !proofFile) throw new Error("Add a link to your post or upload a screenshot.");
  if (url && !/^https?:\/\/[^\s]{4,280}$/i.test(url)) throw new Error("The link must start with https:// and be the address of your post.");
  getEngine().tx(() => {
    const m = sql().prepare("SELECT status FROM missions WHERE id = ?").get(missionId) as { status: string } | undefined;
    if (!m || m.status !== "active") throw new Error("This mission is not open any more.");
    const prior = sql().prepare("SELECT status FROM mission_submissions WHERE mission_id = ? AND affiliate_id = ? AND status IN ('submitted','approved')").get(missionId, id) as { status: string } | undefined;
    if (prior) throw new Error(prior.status === "approved" ? "You already completed this mission." : "Your proof is already waiting for review.");
    sql().prepare("INSERT INTO mission_submissions (id, mission_id, affiliate_id, proof_url, proof_file) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), missionId, id, url, proofFile);
  });
  publish({ type: "kpi.refresh" });
}

/** Admin: approve (credits the reward as a bonus, paid with the next payout) or reject with a note. Decided once. */
export function reviewSubmission(submissionId: string, approve: boolean, note: string) {
  getEngine().tx(() => {
    const s = sql().prepare("SELECT s.id, s.affiliate_id, s.status, m.title, m.reward_cents, m.reward_text FROM mission_submissions s JOIN missions m ON m.id = s.mission_id WHERE s.id = ?").get(submissionId) as
      | { id: string; affiliate_id: string; status: string; title: string; reward_cents: number; reward_text: string }
      | undefined;
    if (!s) throw new Error("That submission no longer exists.");
    if (s.status !== "submitted") throw new Error(`This proof was already ${s.status}.`);
    if (!approve && !note.trim()) throw new Error("Tell them why in a short note.");
    sql().prepare("UPDATE mission_submissions SET status = ?, admin_note = ?, decided_at = ? WHERE id = ?").run(approve ? "approved" : "rejected", note.trim().slice(0, 300), now(), s.id);
    if (approve && s.reward_cents > 0) sql().prepare("INSERT INTO affiliate_bonuses (id, affiliate_id, amount_cents, reason, submission_id) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), s.affiliate_id, s.reward_cents, `Mission: ${s.title}`.slice(0, 120), s.id);
    const reward = approve ? [s.reward_cents ? `$${(s.reward_cents / 100).toFixed(2)} bonus added to your balance` : "", s.reward_text].filter(Boolean).join(" · ") : note.trim();
    notifyAmbassador(sql(), s.affiliate_id, "mission", approve ? `Mission approved: ${s.title}` : `Mission needs another try: ${s.title}`, reward, "/ambassador/missions");
  });
  publish({ type: "kpi.refresh" });
}

// ---------------------------------------------------------------- kit
export function kitsFor(me: Ambassador) {
  const rows = sql().prepare("SELECT kind, status, note, created_at, updated_at FROM kit_requests WHERE affiliate_id = ? ORDER BY created_at DESC").all(me.id) as { kind: string; status: string; note: string; created_at: string; updated_at: string }[];
  const level = ORDER.indexOf(me.tier);
  const { from, to } = monthRange(currentMonth());
  const thisMonth = sql().prepare("SELECT 1 FROM kit_requests WHERE affiliate_id = ? AND kind = 'monthly' AND created_at >= ? AND created_at < ?").get(me.id, from.toISOString(), to.toISOString());
  return { rows, canRequestMonthly: level >= 1 && !thisMonth && me.status === "active", monthlyThisMonth: !!thisMonth, level, needsAthlete: level < 1 };
}

export function requestMonthlyKit(me: Ambassador) {
  const k = kitsFor(me);
  if (k.level < 1) throw new Error(`The free monthly pouch starts at ${getProgram().tiers.athlete.label}.`);
  if (k.monthlyThisMonth) throw new Error("You already asked for this month's pouch.");
  if (me.status !== "active") throw new Error("Your account is not active.");
  sql().prepare("INSERT INTO kit_requests (id, affiliate_id, kind) VALUES (?, ?, 'monthly')").run(crypto.randomUUID(), me.id);
  publish({ type: "kpi.refresh" });
}

// ---------------------------------------------------------------- resources, news, notifications, leaderboard
export const resourcesList = () => sql().prepare("SELECT id, title, description, category, file_name, stored_name, url, size_bytes FROM resources ORDER BY sort, created_at DESC").all() as { id: string; title: string; description: string; category: string; file_name: string; stored_name: string; url: string; size_bytes: number }[];
export const announcementsList = (limit = 20) => sql().prepare("SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT ?").all(limit) as { id: string; title: string; body: string; created_at: string }[];
export const notificationsFor = (id: string, limit = 40) => sql().prepare("SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE affiliate_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(id, limit) as { id: string; kind: string; title: string; body: string; link: string; read_at: string | null; created_at: string }[];
export const unreadCount = (id: string) => (sql().prepare("SELECT COUNT(*) AS n FROM notifications WHERE affiliate_id = ? AND read_at IS NULL").get(id) as { n: number }).n;
export const markAllRead = (id: string) => void sql().prepare("UPDATE notifications SET read_at = ? WHERE affiliate_id = ? AND read_at IS NULL").run(now(), id);

/** This month's top ambassadors by delivered-or-pending valid orders: handle and count only. Anyone who opted out is left out. */
export function leaderboard(me: Ambassador, at = new Date()) {
  const { from, to } = monthRange(currentMonth(at));
  const rows = sql().prepare(
    `SELECT a.id, CASE WHEN a.instagram_handle <> '' THEN '@' || a.instagram_handle ELSE a.code END AS handle, COUNT(o.id) AS orders
     FROM affiliates a JOIN orders o ON o.affiliate_id = a.id AND ${VALID} AND o.created_at >= ? AND o.created_at < ?
     WHERE a.status = 'active' AND a.leaderboard_optout = 0 GROUP BY a.id ORDER BY orders DESC, a.created_at LIMIT 10`,
  ).all(from.toISOString(), to.toISOString()) as { id: string; handle: string; orders: number }[];
  return rows.map((r, i) => ({ rank: i + 1, handle: r.handle, orders: r.orders, mine: r.id === me.id })); // the id never leaves this function
}

// ---------------------------------------------------------------- profile
export function updateProfile(id: string, f: { phone: string; instagram: string; payoutMethod: string; payoutDetails: string; leaderboardOptOut: boolean }) {
  const ig = f.instagram.trim().replace(/^@+/, "");
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) throw new Error("The Instagram handle can only have letters, numbers, dots and underscores.");
  const phone = f.phone.trim();
  if (phone && !/^\+?[0-9][0-9\s().-]{5,24}$/.test(phone)) throw new Error("That phone number does not look right.");
  sql().prepare("UPDATE affiliates SET phone = ?, instagram_handle = ?, payout_method = ?, payout_details = ?, leaderboard_optout = ?, version = version + 1 WHERE id = ?").run(
    phone, ig, f.payoutMethod.trim().slice(0, 80), f.payoutDetails.trim().slice(0, 300), f.leaderboardOptOut ? 1 : 0, id,
  );
}

export function acceptCurrentTerms(id: string) {
  sql().prepare("UPDATE affiliates SET terms_version = ?, terms_accepted_at = ?, version = version + 1 WHERE id = ?").run(getProgram().termsVersion, now(), id);
}
export const markRulesRead = (id: string) => void sql().prepare("UPDATE affiliates SET rules_read_at = ? WHERE id = ? AND rules_read_at IS NULL").run(now(), id);
