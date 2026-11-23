import crypto from "node:crypto";
import type Database from "better-sqlite3";

/**
 * Stock part of `npm run purge-demo`. Removing demo data lowers stock by what the demo movements added, and EVERY stock change leaves a
 * movement behind, like everywhere else in the app (the stock ledger: on_hand always equals the sum of the item's movements).
 *
 * The script deletes the demo movements afterwards, which on its own already takes their total out of the ledger. So for each item this:
 *   - sets on_hand to  max(0, on_hand - demo total)   (never below zero), and
 *   - writes ONE movement, reason "demo_purge", with the delta that makes the ledger equal the new stock once the demo rows are gone.
 *     That is 0 when the books were consistent (the note records the before and after), and non-zero only when the stock was clamped at
 *     zero or the ledger had drifted: the row then explains the gap, so the invariant still holds afterwards.
 * Runs in one transaction. Call it BEFORE deleting the demo movements, with exactly the demo movements that will be deleted.
 */
export type DemoStockResult = { item: string; before: number; after: number; demoTotal: number; marker: number; clamped: boolean };

export function reverseDemoStock(db: Database.Database, moves: { inventory_item_id: string; delta: number }[], actor = "system"): DemoStockResult[] {
  const per = new Map<string, number>();
  for (const m of moves) per.set(m.inventory_item_id, (per.get(m.inventory_item_id) ?? 0) + m.delta);
  const out: DemoStockResult[] = [];
  db.transaction(() => {
    for (const [item, demoTotal] of per) {
      const row = db.prepare("SELECT on_hand FROM inventory_items WHERE id = ?").get(item) as { on_hand: number } | undefined;
      if (!row) continue; // the item itself is gone
      const before = row.on_hand;
      const after = Math.max(0, before - demoTotal);
      const ledger = (db.prepare("SELECT COALESCE(SUM(delta), 0) AS v FROM stock_movements WHERE inventory_item_id = ?").get(item) as { v: number }).v;
      const marker = after - (ledger - demoTotal); // the ledger once the demo movements are deleted, made equal to the new stock
      db.prepare("UPDATE inventory_items SET on_hand = ?, version = version + 1 WHERE id = ?").run(after, item);
      db.prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, note, order_id, actor, is_demo) VALUES (?, ?, ?, 'demo_purge', ?, NULL, ?, 0)").run(
        crypto.randomUUID(), item, marker, `Demo data removed: stock ${before} -> ${after} (demo movements totalled ${demoTotal})`, actor,
      );
      out.push({ item, before, after, demoTotal, marker, clamped: before - demoTotal < 0 });
    }
  })();
  return out;
}
