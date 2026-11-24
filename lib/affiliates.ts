import "server-only";
import crypto from "node:crypto";
import { AFFILIATE_STATUSES, COMMISSION_APPROVAL_DAYS, DEFAULT_COMMISSION_PERCENT, DEFAULT_CUSTOMER_DISCOUNT_PERCENT, TIER_RULES, type AffiliateTier } from "@/config/affiliates";
import { isValidCode, normalizeCode } from "./affiliate-math";
import { getEngine } from "./db";
import { publish } from "./events";
import { monthRange, zonedParts } from "./time";

/**
 * Influencer affiliates: data access, commission lifecycle and reporting. Money is integer cents inside the SQL here; the
 * rates are percent x100 (15% = 1500). Everything that changes several rows runs in one transaction.
 */
const db = () => getEngine().sqlite;
const uuid = () => crypto.randomUUID();
export const newToken = () => crypto.randomBytes(24).toString("base64url");

export type AffiliateRow = {
  id: string; name: string; instagram_handle: string; phone: string; email: string; code: string; tier: AffiliateTier;
  commission_rate_x100: number; customer_discount_percent_x100: number; status: "active" | "paused" | "ended";
  payout_method: string; notes: string; private_token: string; version: number; created_at: string;
};

/** Orders that count as real affiliate sales: not cancelled, returned, draft or test. */
const VALID = "o.status NOT IN ('cancelled','returned','draft') AND o.is_test = 0";

// ---------------------------------------------------------------- codes
export function codeTaken(code: string, exceptId?: string): boolean {
  const c = normalizeCode(code);
  const a = db().prepare("SELECT id FROM affiliates WHERE code = ?").get(c) as { id: string } | undefined;
  if (a && a.id !== exceptId) return true;
  return !!db().prepare("SELECT 1 FROM discounts WHERE code = ?").get(c); // one code namespace: a discount code can not be an affiliate code
}

/** A readable random code from the name: first name (letters only, up to 8) + two digits. */
export function generateCode(name: string): string {
  const first = name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().split(/\s+/)[0] ?? "";
  const base = first.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8) || "MIEL";
  for (let i = 0; i < 200; i++) {
    const c = `${base}${String(10 + Math.floor(Math.random() * 90))}`;
    if (!codeTaken(c)) return c;
  }
  return `${base}${crypto.randomInt(1000, 9999)}`.slice(0, 20);
}

// ---------------------------------------------------------------- create / update
export type AffiliateInput = {
  name: string; instagram_handle?: string; phone?: string; email?: string; code: string; tier?: string;
  commission_percent?: number; customer_discount_percent?: number; status?: string; payout_method?: string; notes?: string;
};

const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const percentX100 = (n: unknown, label: string) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${label} must be between 0 and 100.`);
  return Math.round(v * 100);
};

/** Validates everything (this is the only place a value is checked), then returns the row to store. */
export function validateAffiliate(i: AffiliateInput, exceptId?: string) {
  const name = clean(i.name, 80);
  if (name.length < 2) throw new Error("Enter the affiliate's name.");
  const code = normalizeCode(i.code);
  if (!isValidCode(code)) throw new Error("The code must be 3 to 20 letters or numbers, no spaces.");
  if (codeTaken(code, exceptId)) throw new Error("That code is already used. Pick another.");
  const tier = (i.tier ?? "seed") as AffiliateTier;
  if (!(tier in TIER_RULES)) throw new Error("Pick a tier.");
  const status = i.status ?? "active";
  if (!(AFFILIATE_STATUSES as readonly string[]).includes(status)) throw new Error("Pick a status.");
  const email = clean(i.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address does not look right.");
  const handle = clean(i.instagram_handle, 40).replace(/^@+/, "");
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new Error("The Instagram handle can only have letters, numbers, dots and underscores.");
  return {
    name, code, tier, status, email, instagram_handle: handle, phone: clean(i.phone, 30), payout_method: clean(i.payout_method, 80), notes: clean(i.notes, 1000),
    commission_rate_x100: percentX100(i.commission_percent ?? DEFAULT_COMMISSION_PERCENT, "Commission"),
    customer_discount_percent_x100: percentX100(i.customer_discount_percent ?? DEFAULT_CUSTOMER_DISCOUNT_PERCENT, "Customer discount"),
  };
}

export function createAffiliate(i: AffiliateInput): AffiliateRow {
  const v = validateAffiliate(i);
  const id = uuid();
  try {
    db().prepare(
      `INSERT INTO affiliates (id, name, instagram_handle, phone, email, code, tier, commission_rate_x100, customer_discount_percent_x100, status, payout_method, notes, private_token)
       VALUES (@id, @name, @instagram_handle, @phone, @email, @code, @tier, @commission_rate_x100, @customer_discount_percent_x100, @status, @payout_method, @notes, @token)`,
    ).run({ ...v, id, token: newToken() });
  } catch (e) {
    if (/UNIQUE/i.test((e as Error).message)) throw new Error("That code is already used. Pick another."); // lost a race with another admin
    throw e;
  }
  return getAffiliate(id)!;
}

/** Update with optimistic locking: a stale form is refused rather than silently overwriting someone else's edit. */
export function updateAffiliate(id: string, i: AffiliateInput, expectedVersion?: number): AffiliateRow {
  if (!getAffiliate(id)) throw new Error("That affiliate no longer exists.");
  const v = validateAffiliate(i, id);
  let r;
  try {
    r = db().prepare(
      `UPDATE affiliates SET name=@name, instagram_handle=@instagram_handle, phone=@phone, email=@email, code=@code, tier=@tier,
         commission_rate_x100=@commission_rate_x100, customer_discount_percent_x100=@customer_discount_percent_x100, status=@status,
         payout_method=@payout_method, notes=@notes, version = version + 1
       WHERE id=@id AND (@ver IS NULL OR version=@ver)`,
    ).run({ ...v, id, ver: expectedVersion ?? null });
  } catch (e) {
    if (/UNIQUE/i.test((e as Error).message)) throw new Error("That code is already used. Pick another.");
    throw e;
  }
  if (!r.changes) throw new Error("Someone else changed this record while you were editing. Reload the page and try again.");
  return getAffiliate(id)!;
}

export const getAffiliate = (id: string) => db().prepare("SELECT * FROM affiliates WHERE id = ?").get(id) as AffiliateRow | undefined;
export const getAffiliateByToken = (token: string) =>
  token && token.length >= 20 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token) ? (db().prepare("SELECT * FROM affiliates WHERE private_token = ?").get(token) as AffiliateRow | undefined) : undefined;

// ---------------------------------------------------------------- commission lifecycle
/**
 * pending -> approved, COMMISSION_APPROVAL_DAYS after delivery. Idempotent; called whenever an affiliate page is opened,
 * so no scheduler is needed. (Void and paid are applied at the moment they happen: setOrderStatus and recordPayout.)
 */
export function approveDueCommissions(now = new Date()): number {
  const cutoff = new Date(now.getTime() - COMMISSION_APPROVAL_DAYS * 86_400_000).toISOString();
  return db().prepare("UPDATE orders SET commission_status = 'approved' WHERE commission_status = 'pending' AND status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at <= ?").run(cutoff).changes;
}

/**
 * Pays out every approved, unpaid commission of one affiliate in one transaction and records the payout.
 * Corrections come off it: a commission that was paid and whose order was LATER cancelled or returned is owed back, shown on the
 * affiliate's balance, and deducted here (the payout stores gross, corrections and net). If the corrections exceed the approved
 * amount nothing is paid and the correction carries forward.
 * Two clicks, two tabs or a retry cannot pay the same commission twice: the whole thing runs under one write lock and every
 * order is moved from approved to paid with a guarded UPDATE.
 */
export function recordPayout(affiliateId: string, o: { method?: string; note?: string }) {
  if (!getAffiliate(affiliateId)) throw new Error("That affiliate no longer exists.");
  const out = getEngine().tx(() => {
    approveDueCommissions(); // never pay on stale statuses
    const due = db().prepare("SELECT id, commission_amount_cents AS c FROM orders WHERE affiliate_id = ? AND commission_status = 'approved' AND commission_payout_id IS NULL").all(affiliateId) as { id: string; c: number }[];
    const back = db().prepare("SELECT id, commission_amount_cents AS c FROM orders WHERE affiliate_id = ? AND commission_status = 'void' AND commission_payout_id IS NOT NULL AND commission_correction_payout_id IS NULL").all(affiliateId) as { id: string; c: number }[];
    const gross = due.reduce((n, r) => n + r.c, 0);
    const corrections = back.reduce((n, r) => n + r.c, 0);
    if (!due.length || gross <= 0) throw new Error("Nothing approved to pay out yet. Commissions are approved 14 days after delivery.");
    const net = gross - corrections;
    if (net <= 0) throw new Error(`Nothing to pay: corrections of $${(corrections / 100).toFixed(2)} (orders returned or cancelled after they were paid) are more than the approved $${(gross / 100).toFixed(2)}. They carry forward.`);
    const id = uuid();
    db().prepare("INSERT INTO affiliate_payouts (id, affiliate_id, amount_cents, gross_cents, corrections_cents, method, note) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, affiliateId, net, gross, corrections, clean(o.method, 80), clean(o.note, 300));
    const upd = db().prepare("UPDATE orders SET commission_status = 'paid', commission_payout_id = ? WHERE id = ? AND commission_status = 'approved' AND commission_payout_id IS NULL");
    let n = 0;
    for (const r of due) n += upd.run(id, r.id).changes;
    const settle = db().prepare("UPDATE orders SET commission_correction_payout_id = ? WHERE id = ? AND commission_status = 'void' AND commission_payout_id IS NOT NULL AND commission_correction_payout_id IS NULL");
    let m = 0;
    for (const r of back) m += settle.run(id, r.id).changes;
    if (n !== due.length || m !== back.length) throw new Error("Commissions changed while paying. Try again."); // rolls the whole payout back
    return { id, amountCents: net, grossCents: gross, correctionsCents: corrections, orders: n };
  });
  publish({ type: "kpi.refresh" });
  return out;
}

/**
 * The books must always balance, per affiliate: money paid out = commissions ever paid − corrections already deducted.
 * Returns the affiliates where they do not (empty = healthy). Used by the QA tests and available to operations.
 */
export function checkAffiliateBooks(): { affiliate_id: string; paid_out_cents: number; expected_cents: number }[] {
  return db().prepare(
    `SELECT a.id AS affiliate_id,
            COALESCE((SELECT SUM(amount_cents) FROM affiliate_payouts p WHERE p.affiliate_id = a.id), 0) AS paid_out_cents,
            COALESCE((SELECT SUM(commission_amount_cents) FROM orders o WHERE o.affiliate_id = a.id AND o.commission_payout_id IS NOT NULL), 0)
          - COALESCE((SELECT SUM(commission_amount_cents) FROM orders o WHERE o.affiliate_id = a.id AND o.commission_correction_payout_id IS NOT NULL), 0) AS expected_cents
     FROM affiliates a
     WHERE paid_out_cents <> expected_cents`,
  ).all() as { affiliate_id: string; paid_out_cents: number; expected_cents: number }[];
}

// ---------------------------------------------------------------- reporting
export type AffiliateStats = AffiliateRow & {
  orders: number; delivered: number; sales_cents: number; pending_cents: number; approved_cents: number; paid_cents: number; corrections_cents: number; last_order: string | null;
};

const STATS_SQL = `
  SELECT a.*,
    COALESCE(SUM(CASE WHEN ${VALID} THEN 1 END), 0) AS orders,
    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND o.is_test = 0 THEN 1 END), 0) AS delivered,
    COALESCE(SUM(CASE WHEN ${VALID} THEN o.subtotal_cents - o.discount_amount_cents END), 0) AS sales_cents,
    COALESCE(SUM(CASE WHEN o.commission_status = 'pending' THEN o.commission_amount_cents END), 0) AS pending_cents,
    COALESCE(SUM(CASE WHEN o.commission_status = 'approved' THEN o.commission_amount_cents END), 0) AS approved_cents,
    COALESCE(SUM(CASE WHEN o.commission_status = 'paid' THEN o.commission_amount_cents END), 0) AS paid_cents,
    COALESCE(SUM(CASE WHEN o.commission_status = 'void' AND o.commission_payout_id IS NOT NULL AND o.commission_correction_payout_id IS NULL THEN o.commission_amount_cents END), 0) AS corrections_cents,
    MAX(o.created_at) AS last_order
  FROM affiliates a LEFT JOIN orders o ON o.affiliate_id = a.id`;

export function listAffiliates(opts: { q?: string; status?: string } = {}): AffiliateStats[] {
  approveDueCommissions();
  const where: string[] = [];
  const p: unknown[] = [];
  const q = (opts.q ?? "").trim();
  if (q) {
    where.push("(a.name LIKE ? ESCAPE '!' OR a.code LIKE ? ESCAPE '!' OR a.instagram_handle LIKE ? ESCAPE '!')");
    const like = `%${q.replace(/[%_!]/g, (c) => `!${c}`)}%`;
    p.push(like, like, like);
  }
  if (opts.status && (AFFILIATE_STATUSES as readonly string[]).includes(opts.status)) {
    where.push("a.status = ?");
    p.push(opts.status);
  }
  return db().prepare(`${STATS_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY a.id ORDER BY sales_cents DESC, a.created_at DESC`).all(...p) as AffiliateStats[];
}

export function affiliateStats(id: string): AffiliateStats | undefined {
  approveDueCommissions();
  return db().prepare(`${STATS_SQL} WHERE a.id = ? GROUP BY a.id`).get(id) as AffiliateStats | undefined;
}

export type AffiliateOrder = {
  id: string; order_number: number; created_at: string; status: string; delivered_at: string | null; subtotal_cents: number; discount_amount_cents: number;
  commission_amount_cents: number; commission_status: string | null; commission_payout_id: string | null; commission_correction_payout_id: string | null; code_used: string | null; customer_name: string | null;
};
export function affiliateOrders(id: string, limit = 100): AffiliateOrder[] {
  return db().prepare(
    `SELECT o.id, o.order_number, o.created_at, o.status, o.delivered_at, o.subtotal_cents, o.discount_amount_cents, o.commission_amount_cents, o.commission_status, o.commission_payout_id, o.commission_correction_payout_id, o.code_used, c.name AS customer_name
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.affiliate_id = ? AND o.is_test = 0 AND o.status <> 'draft' ORDER BY o.created_at DESC LIMIT ?`,
  ).all(id, limit) as AffiliateOrder[];
}
export const affiliatePayouts = (id: string) =>
  db().prepare("SELECT id, amount_cents, gross_cents, corrections_cents, method, note, paid_at FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY paid_at DESC, rowid DESC").all(id) as { id: string; amount_cents: number; gross_cents: number; corrections_cents: number; method: string; note: string; paid_at: string }[];

/** "Athlete at 10 delivered orders, Ambassador at 30": the highest tier earned, if it is above the current one. */
export function suggestedTier(delivered: number, current: AffiliateTier): AffiliateTier | null {
  const order: AffiliateTier[] = ["seed", "athlete", "ambassador"];
  let best: AffiliateTier | null = null;
  for (const t of order) if (delivered >= TIER_RULES[t].minDelivered && order.indexOf(t) > order.indexOf(current)) best = t;
  return best;
}

/** One-tap upgrade: sets the tier and that tier's commission rate. Orders already placed keep the commission they were created with. */
export function upgradeTier(id: string, to: AffiliateTier): AffiliateRow {
  const a = affiliateStats(id);
  if (!a) throw new Error("That affiliate no longer exists.");
  if (!(to in TIER_RULES) || to === a.tier || a.delivered < TIER_RULES[to].minDelivered || ["seed", "athlete", "ambassador"].indexOf(to) < ["seed", "athlete", "ambassador"].indexOf(a.tier))
    throw new Error("This affiliate has not reached that tier yet.");
  db().prepare("UPDATE affiliates SET tier = ?, commission_rate_x100 = ?, version = version + 1 WHERE id = ?").run(to, TIER_RULES[to].commissionPercent * 100, id);
  return getAffiliate(id)!;
}

export function overview() {
  approveDueCommissions();
  const r = db().prepare(
    `SELECT COALESCE(SUM(CASE WHEN ${VALID} THEN o.subtotal_cents - o.discount_amount_cents END), 0) AS sales_cents,
            COALESCE(SUM(CASE WHEN ${VALID} THEN 1 END), 0) AS orders,
            COALESCE(SUM(CASE WHEN o.commission_status IN ('pending','approved') THEN o.commission_amount_cents END), 0) AS owed_cents,
            COALESCE(SUM(CASE WHEN o.commission_status = 'approved' THEN o.commission_amount_cents END), 0) AS payable_cents,
            COALESCE(SUM(CASE WHEN o.commission_status = 'paid' THEN o.commission_amount_cents END), 0) AS paid_cents,
            COALESCE(SUM(CASE WHEN o.commission_status = 'void' AND o.commission_payout_id IS NOT NULL AND o.commission_correction_payout_id IS NULL THEN o.commission_amount_cents END), 0) AS corrections_cents
     FROM orders o WHERE o.affiliate_id IS NOT NULL`,
  ).get() as { sales_cents: number; orders: number; owed_cents: number; payable_cents: number; paid_cents: number; corrections_cents: number };
  const counts = db().prepare("SELECT (SELECT COUNT(*) FROM affiliates WHERE status = 'active') AS active, (SELECT COUNT(*) FROM affiliate_applications WHERE status = 'new') AS applications").get() as { active: number; applications: number };
  const top = db().prepare(
    `SELECT a.id, a.name, a.code, COALESCE(SUM(o.subtotal_cents - o.discount_amount_cents), 0) AS sales_cents, COUNT(o.id) AS orders
     FROM affiliates a JOIN orders o ON o.affiliate_id = a.id AND ${VALID} GROUP BY a.id ORDER BY sales_cents DESC LIMIT 5`,
  ).all() as { id: string; name: string; code: string; sales_cents: number; orders: number }[];
  return { ...r, ...counts, top };
}

export type MonthlyRow = {
  order_number: number; created_at: string; status: string; affiliate: string; code: string; subtotal_cents: number; discount_amount_cents: number;
  commission_amount_cents: number; commission_status: string | null; delivered_at: string | null; correction_owed: number;
};
/** Rows for the monthly CSV: the month is a calendar month in the STORE'S time zone (Asia/Beirut), by the order's creation time. */
export function monthlyRows(month: string): MonthlyRow[] {
  const { from, to } = monthRange(month);
  return db().prepare(
    `SELECT o.order_number, o.created_at, o.status, a.name AS affiliate, a.code, o.subtotal_cents, o.discount_amount_cents, o.commission_amount_cents, o.commission_status, o.delivered_at,
            CASE WHEN o.commission_status = 'void' AND o.commission_payout_id IS NOT NULL THEN 1 ELSE 0 END AS correction_owed
     FROM orders o JOIN affiliates a ON a.id = o.affiliate_id WHERE o.is_test = 0 AND o.status <> 'draft' AND o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at`,
  ).all(from.toISOString(), to.toISOString()) as MonthlyRow[];
}

// ---------------------------------------------------------------- applications
export type ApplicationInput = { name: string; instagram_handle?: string; tiktok_handle?: string; followers?: string; city?: string; sport?: string; message?: string };
export function validateApplication(i: ApplicationInput) {
  const name = clean(i.name, 80);
  if (name.length < 2) throw new Error("Enter your name.");
  const handle = (s: unknown) => clean(s, 60).replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/\/+$/, "").slice(0, 40);
  const ig = handle(i.instagram_handle);
  const tt = handle(i.tiktok_handle).replace(/^@+/, "");
  if (!ig && !tt) throw new Error("Add your Instagram or TikTok handle so we can find you.");
  for (const h of [ig, tt]) if (h && !/^[A-Za-z0-9._]{1,30}$/.test(h)) throw new Error("Handles can only have letters, numbers, dots and underscores.");
  const followers = clean(i.followers, 20);
  if (followers && !/^[0-9][0-9.,]*\s?[kKmM]?$/.test(followers)) throw new Error("Followers: a number like 12000 or 12k.");
  return { name, instagram_handle: ig, tiktok_handle: tt, followers, city: clean(i.city, 60), sport: clean(i.sport, 60), message: clean(i.message, 1000) };
}
export function createApplication(i: ApplicationInput) {
  const v = validateApplication(i);
  const id = uuid();
  db().prepare("INSERT INTO affiliate_applications (id, name, instagram_handle, tiktok_handle, followers, city, sport, message) VALUES (@id, @name, @instagram_handle, @tiktok_handle, @followers, @city, @sport, @message)").run({ ...v, id });
  publish({ type: "application.created", id });
  return id;
}

type ApplicationRow = ApplicationInput & { id: string; name: string; status: string; created_at: string };
export const listApplications = (status?: string) =>
  db().prepare(`SELECT * FROM affiliate_applications ${status ? "WHERE status = ?" : ""} ORDER BY (status = 'new') DESC, created_at DESC LIMIT 200`).all(...(status ? [status] : [])) as ApplicationRow[];

/** Approving creates an affiliate (seed tier, default rates, a generated code the admin can change) in one transaction. */
export function approveApplication(id: string): AffiliateRow {
  return getEngine().tx(() => {
    const a = db().prepare("SELECT * FROM affiliate_applications WHERE id = ?").get(id) as ApplicationRow | undefined;
    if (!a) throw new Error("That application no longer exists.");
    if (a.status !== "new") throw new Error(`This application was already ${a.status}.`);
    const details = [a.tiktok_handle && `TikTok @${a.tiktok_handle}`, a.followers && `${a.followers} followers`, a.city, a.sport].filter(Boolean).join(" · ");
    const aff = createAffiliate({ name: a.name, instagram_handle: a.instagram_handle ?? "", code: generateCode(a.name), notes: [details, a.message].filter(Boolean).join("\n") });
    db().prepare("UPDATE affiliate_applications SET status = 'approved' WHERE id = ?").run(id);
    return aff;
  });
}
export function rejectApplication(id: string) {
  const r = db().prepare("UPDATE affiliate_applications SET status = 'rejected' WHERE id = ? AND status = 'new'").run(id);
  if (!r.changes) throw new Error("This application was already handled.");
}

// ---------------------------------------------------------------- navigation, overview and payouts screens
/** New (undecided) ambassador applications: the badge on the Applications tab and on the Affiliates menu item. */
export const newApplicationCount = (): number => (db().prepare("SELECT COUNT(*) AS n FROM affiliate_applications WHERE status = 'new'").get() as { n: number }).n;

/** Top affiliates by sales in the current calendar month of the store's time zone (Asia/Beirut). */
export function topThisMonth(limit = 5, now = new Date()) {
  const { y, m } = zonedParts(now);
  const { from, to } = monthRange(`${y}-${String(m).padStart(2, "0")}`);
  return db().prepare(
    `SELECT a.id, a.name, a.code, COALESCE(SUM(o.subtotal_cents - o.discount_amount_cents), 0) AS sales_cents, COUNT(o.id) AS orders
     FROM affiliates a JOIN orders o ON o.affiliate_id = a.id AND ${VALID} AND o.created_at >= ? AND o.created_at < ?
     GROUP BY a.id ORDER BY sales_cents DESC, a.name LIMIT ?`,
  ).all(from.toISOString(), to.toISOString(), limit) as { id: string; name: string; code: string; sales_cents: number; orders: number }[];
}

export type PayoutRow = { id: string; affiliate_id: string; name: string; code: string; instagram_handle: string; amount_cents: number; gross_cents: number; corrections_cents: number; method: string; note: string; paid_at: string };
/** Every payout, newest first, with the affiliate. `month` (YYYY-MM, store time zone) limits it for the CSV; `limit` caps the screen. */
export function listPayouts(opts: { month?: string; limit?: number } = {}): PayoutRow[] {
  const where: string[] = [];
  const p: unknown[] = [];
  if (opts.month) {
    const { from, to } = monthRange(opts.month);
    where.push("p.paid_at >= ? AND p.paid_at < ?");
    p.push(from.toISOString(), to.toISOString());
  }
  return db().prepare(
    `SELECT p.id, p.affiliate_id, a.name, a.code, a.instagram_handle, p.amount_cents, p.gross_cents, p.corrections_cents, p.method, p.note, p.paid_at
     FROM affiliate_payouts p JOIN affiliates a ON a.id = p.affiliate_id ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY p.paid_at DESC, p.rowid DESC ${opts.limit ? "LIMIT " + Math.floor(opts.limit) : ""}`,
  ).all(...p) as PayoutRow[];
}

/** Everyone, for the "filter orders by affiliate" menu. */
export const affiliateOptions = () => db().prepare("SELECT id, name, code FROM affiliates ORDER BY name COLLATE NOCASE").all() as { id: string; name: string; code: string }[];
