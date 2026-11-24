import crypto from "node:crypto";
import type Database from "better-sqlite3";

/** An in-portal notification (new sale, commission approved, payout paid, mission reviewed, tier upgrade, kit update). Cheap and synchronous: call it inside the transaction that caused it. */
export type NotificationKind = "sale" | "commission" | "payout" | "mission" | "tier" | "kit" | "news" | "account";

export function notifyAmbassador(db: Database.Database, affiliateId: string, kind: NotificationKind, title: string, body = "", link = "") {
  db.prepare("INSERT INTO notifications (id, affiliate_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), affiliateId, kind, title.slice(0, 120), body.slice(0, 300), link.slice(0, 200));
}
