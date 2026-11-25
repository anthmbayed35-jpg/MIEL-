import "server-only";
import crypto from "node:crypto";
import { getEngine } from "../db";
import { publish } from "../events";
import { monthRange } from "../time";
import { notifyAmbassador } from "./notify";

/** Back-office side of the ambassador program: queues that need a decision, missions, kits, content and reports. Permission checks live in the actions and pages that call these. */
const sql = () => getEngine().sqlite;
const one = <T,>(q: string, ...p: unknown[]) => sql().prepare(q).get(...p) as T;
const all = <T,>(q: string, ...p: unknown[]) => sql().prepare(q).all(...p) as T[];

// ---------------------------------------------------------------- what needs doing
export type NeedsAction = { applications: number; payoutRequests: number; proofs: number; kits: number; total: number };
export function needsAction(): NeedsAction {
  const applications = one<{ n: number }>("SELECT COUNT(*) AS n FROM affiliate_applications WHERE status = 'new'").n;
  const payoutRequests = one<{ n: number }>("SELECT COUNT(*) AS n FROM payout_requests WHERE status = 'requested'").n;
  const proofs = one<{ n: number }>("SELECT COUNT(*) AS n FROM mission_submissions WHERE status = 'submitted'").n;
  const kits = one<{ n: number }>("SELECT COUNT(*) AS n FROM kit_requests WHERE status = 'requested'").n;
  return { applications, payoutRequests, proofs, kits, total: applications + payoutRequests + proofs + kits };
}

// ---------------------------------------------------------------- payout requests
export type PayoutRequestRow = { id: string; affiliate_id: string; name: string; code: string; amount_cents: number; status: string; note: string; created_at: string; payout_method: string; payout_details: string };
export const listPayoutRequests = (onlyOpen = false) =>
  all<PayoutRequestRow>(
    `SELECT r.id, r.affiliate_id, a.name, a.code, r.amount_cents, r.status, r.note, r.created_at, a.payout_method, a.payout_details
     FROM payout_requests r JOIN affiliates a ON a.id = r.affiliate_id ${onlyOpen ? "WHERE r.status = 'requested'" : ""} ORDER BY (r.status = 'requested') DESC, r.created_at DESC LIMIT 100`,
  );

export function rejectPayoutRequest(id: string, note: string) {
  if (!note.trim()) throw new Error("Tell them why in a short note.");
  getEngine().tx(() => {
    const r = one<{ affiliate_id: string; status: string } | undefined>("SELECT affiliate_id, status FROM payout_requests WHERE id = ?", id);
    if (!r) throw new Error("That request no longer exists.");
    if (r.status !== "requested") throw new Error(`This request was already ${r.status}.`);
    sql().prepare("UPDATE payout_requests SET status = 'rejected', note = ?, decided_at = ? WHERE id = ?").run(note.trim().slice(0, 300), new Date().toISOString(), id);
    notifyAmbassador(sql(), r.affiliate_id, "payout", "Payout request declined", note.trim(), "/ambassador/payouts");
  });
  publish({ type: "kpi.refresh" });
}

// ---------------------------------------------------------------- missions
export type MissionRow = { id: string; title: string; description: string; reward_cents: number; reward_text: string; month: string; status: string; created_at: string; submitted: number; approved: number };
export const listMissions = () =>
  all<MissionRow>(
    `SELECT m.*, (SELECT COUNT(*) FROM mission_submissions s WHERE s.mission_id = m.id AND s.status = 'submitted') AS submitted,
            (SELECT COUNT(*) FROM mission_submissions s WHERE s.mission_id = m.id AND s.status = 'approved') AS approved
     FROM missions m ORDER BY (m.status = 'active') DESC, m.created_at DESC LIMIT 100`,
  );

export function saveMission(f: { id?: string; title: string; description: string; rewardDollars: string; rewardText: string; month: string }) {
  const title = f.title.trim();
  if (title.length < 3 || title.length > 100) throw new Error("Give the mission a title (3 to 100 characters).");
  if (f.description.length > 800) throw new Error("The description is too long (800 characters max).");
  const dollars = f.rewardDollars.trim() === "" ? 0 : Number(f.rewardDollars);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1000) throw new Error("The reward must be between $0 and $1000.");
  const cents = Math.round(dollars * 100);
  if (!cents && !f.rewardText.trim()) throw new Error("Add a reward: dollars, or a short text such as a free pouch.");
  if (f.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) throw new Error("The month must look like 2026-12.");
  if (f.id) {
    const r = sql().prepare("UPDATE missions SET title = ?, description = ?, reward_cents = ?, reward_text = ?, month = ? WHERE id = ?").run(title, f.description.trim(), cents, f.rewardText.trim().slice(0, 120), f.month, f.id);
    if (!r.changes) throw new Error("That mission no longer exists.");
    return f.id;
  }
  const id = crypto.randomUUID();
  sql().prepare("INSERT INTO missions (id, title, description, reward_cents, reward_text, month) VALUES (?, ?, ?, ?, ?, ?)").run(id, title, f.description.trim(), cents, f.rewardText.trim().slice(0, 120), f.month);
  const ids = all<{ id: string }>("SELECT id FROM affiliates WHERE status = 'active' AND password_hash IS NOT NULL");
  for (const a of ids) notifyAmbassador(sql(), a.id, "mission", `New mission: ${title}`, "", "/ambassador/missions");
  return id;
}
export function setMissionStatus(id: string, status: "active" | "ended") {
  const r = sql().prepare("UPDATE missions SET status = ? WHERE id = ?").run(status, id);
  if (!r.changes) throw new Error("That mission no longer exists.");
}

export type SubmissionRow = { id: string; mission_title: string; affiliate_id: string; name: string; code: string; proof_url: string; proof_file: string; status: string; admin_note: string; created_at: string };
export const listSubmissions = (status = "submitted") =>
  all<SubmissionRow>(
    `SELECT s.id, m.title AS mission_title, s.affiliate_id, a.name, a.code, s.proof_url, s.proof_file, s.status, s.admin_note, s.created_at
     FROM mission_submissions s JOIN missions m ON m.id = s.mission_id JOIN affiliates a ON a.id = s.affiliate_id WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 100`,
    status,
  );

// ---------------------------------------------------------------- kits
export type KitRow = { id: string; affiliate_id: string; name: string; code: string; phone: string; city: string; kind: string; status: string; note: string; created_at: string };
export const listKits = (onlyOpen = false) =>
  all<KitRow>(
    `SELECT k.id, k.affiliate_id, a.name, a.code, a.phone, '' AS city, k.kind, k.status, k.note, k.created_at
     FROM kit_requests k JOIN affiliates a ON a.id = k.affiliate_id ${onlyOpen ? "WHERE k.status <> 'delivered'" : ""} ORDER BY (k.status = 'requested') DESC, (k.status = 'shipped') DESC, k.created_at DESC LIMIT 100`,
  );
export function setKitStatus(id: string, status: "requested" | "shipped" | "delivered", note = "") {
  if (!["requested", "shipped", "delivered"].includes(status)) throw new Error("Unknown status.");
  getEngine().tx(() => {
    const k = one<{ affiliate_id: string; kind: string } | undefined>("SELECT affiliate_id, kind FROM kit_requests WHERE id = ?", id);
    if (!k) throw new Error("That request no longer exists.");
    sql().prepare("UPDATE kit_requests SET status = ?, note = ?, updated_at = ? WHERE id = ?").run(status, note.trim().slice(0, 200), new Date().toISOString(), id);
    notifyAmbassador(sql(), k.affiliate_id, "kit", `Your ${k.kind === "starter" ? "starter kit" : "monthly pouch"} is ${status}`, note.trim(), "/ambassador/kit");
  });
  publish({ type: "kpi.refresh" });
}

// ---------------------------------------------------------------- content
export function addResource(f: { title: string; description: string; category: string; url: string; fileName: string; storedName: string; size: number }) {
  const title = f.title.trim();
  if (title.length < 2 || title.length > 100) throw new Error("Give the resource a title.");
  const url = f.url.trim();
  if (!url && !f.storedName) throw new Error("Upload a file or paste a link.");
  if (url && !/^https:\/\/[^\s]{4,300}$/i.test(url)) throw new Error("The link must start with https://");
  sql().prepare("INSERT INTO resources (id, title, description, category, file_name, stored_name, url, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    crypto.randomUUID(), title, f.description.trim().slice(0, 300), f.category.trim().slice(0, 40), f.fileName.slice(0, 120), f.storedName, url, f.size,
  );
}
export const listResources = () => all<{ id: string; title: string; category: string; file_name: string; url: string; created_at: string }>("SELECT id, title, category, file_name, url, created_at FROM resources ORDER BY sort, created_at DESC");
export const deleteResource = (id: string) => void sql().prepare("DELETE FROM resources WHERE id = ?").run(id);

export function addAnnouncement(title: string, body: string) {
  if (title.trim().length < 3 || title.length > 100) throw new Error("Give the announcement a title.");
  if (body.trim().length < 3 || body.length > 1500) throw new Error("Write the announcement (up to 1500 characters).");
  const id = crypto.randomUUID();
  getEngine().tx(() => {
    sql().prepare("INSERT INTO announcements (id, title, body) VALUES (?, ?, ?)").run(id, title.trim(), body.trim());
    for (const a of all<{ id: string }>("SELECT id FROM affiliates WHERE status <> 'ended' AND password_hash IS NOT NULL")) notifyAmbassador(sql(), a.id, "news", title.trim(), "", "/ambassador/news");
  });
}
export const listAnnouncements = () => all<{ id: string; title: string; body: string; created_at: string }>("SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 50");
export const deleteAnnouncement = (id: string) => void sql().prepare("DELETE FROM announcements WHERE id = ?").run(id);

// ---------------------------------------------------------------- applications
export function saveApplicationNotes(id: string, notes: string) {
  const r = sql().prepare("UPDATE affiliate_applications SET admin_notes = ? WHERE id = ?").run(notes.trim().slice(0, 1000), id);
  if (!r.changes) throw new Error("That application no longer exists.");
}

// ---------------------------------------------------------------- one ambassador (admin detail)
export function ambassadorExtras(id: string) {
  const clicks = one<{ total: number; month: number }>("SELECT COALESCE(SUM(count), 0) AS total, COALESCE(SUM(CASE WHEN day >= ? THEN count ELSE 0 END), 0) AS month FROM ref_clicks WHERE affiliate_id = ?", `${new Date().toISOString().slice(0, 7)}-01`, id);
  const missions = all<{ title: string; status: string; created_at: string }>("SELECT m.title, s.status, s.created_at FROM mission_submissions s JOIN missions m ON m.id = s.mission_id WHERE s.affiliate_id = ? ORDER BY s.created_at DESC LIMIT 10", id);
  const kits = all<{ kind: string; status: string; created_at: string }>("SELECT kind, status, created_at FROM kit_requests WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 10", id);
  const bonus = one<{ open: number; paid: number }>("SELECT COALESCE(SUM(CASE WHEN payout_id IS NULL THEN amount_cents END), 0) AS open, COALESCE(SUM(CASE WHEN payout_id IS NOT NULL THEN amount_cents END), 0) AS paid FROM affiliate_bonuses WHERE affiliate_id = ?", id);
  const acct = one<{ password_hash: string | null; last_login_at: string | null; terms_version: number | null; terms_accepted_at: string | null; rules_read_at: string | null }>("SELECT password_hash, last_login_at, terms_version, terms_accepted_at, rules_read_at FROM affiliates WHERE id = ?", id);
  return { clicks, missions, kits, bonus, hasPassword: !!acct?.password_hash, lastLogin: acct?.last_login_at ?? null, termsVersion: acct?.terms_version ?? null, termsAt: acct?.terms_accepted_at ?? null, rulesRead: acct?.rules_read_at ?? null };
}

// ---------------------------------------------------------------- reports
export type ReportRow = { id: string; name: string; code: string; orders: number; sales_cents: number; discount_cents: number; commission_cents: number; paid_cents: number; clicks: number };
/** Sales by ambassador for one Beirut month (valid, non-test orders). */
export function salesReport(month: string): ReportRow[] {
  const { from, to } = monthRange(month);
  return all<ReportRow>(
    `SELECT a.id, a.name, a.code, COUNT(o.id) AS orders,
            COALESCE(SUM(o.subtotal_cents - o.discount_amount_cents), 0) AS sales_cents, COALESCE(SUM(o.discount_amount_cents), 0) AS discount_cents,
            COALESCE(SUM(CASE WHEN o.commission_status <> 'void' THEN o.commission_amount_cents ELSE 0 END), 0) AS commission_cents,
            COALESCE(SUM(CASE WHEN o.commission_status = 'paid' THEN o.commission_amount_cents ELSE 0 END), 0) AS paid_cents,
            (SELECT COALESCE(SUM(c.count), 0) FROM ref_clicks c WHERE c.affiliate_id = a.id AND c.day >= ? AND c.day <= ?) AS clicks
     FROM affiliates a JOIN orders o ON o.affiliate_id = a.id AND o.is_test = 0 AND o.status NOT IN ('cancelled','returned','refused','draft') AND o.created_at >= ? AND o.created_at < ?
     GROUP BY a.id ORDER BY sales_cents DESC`,
    `${month}-01`, `${month}-31`, from.toISOString(), to.toISOString(),
  );
}
export const reportMonths = () => all<{ m: string }>("SELECT DISTINCT substr(created_at, 1, 7) AS m FROM orders WHERE affiliate_id IS NOT NULL AND is_test = 0 ORDER BY m DESC LIMIT 24").map((r) => r.m);
export function salesByMonth() {
  return all<{ month: string; orders: number; sales_cents: number; commission_cents: number }>(
    `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS orders, SUM(subtotal_cents - discount_amount_cents) AS sales_cents,
            SUM(CASE WHEN commission_status <> 'void' THEN commission_amount_cents ELSE 0 END) AS commission_cents
     FROM orders WHERE affiliate_id IS NOT NULL AND is_test = 0 AND status NOT IN ('cancelled','returned','refused','draft') GROUP BY month ORDER BY month DESC LIMIT 12`,
  );
}
