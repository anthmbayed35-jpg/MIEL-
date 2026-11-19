import "server-only";
import { getEngine } from "./db/core";

export type LedgerMismatch = { inventory_item_id: string; on_hand: number; ledger: number };

/**
 * The stock ledger invariant: for every inventory item, the displayed stock (on_hand) equals the sum of its stock movements.
 * Returns the items that disagree (empty = healthy). Used by the QA tests and available to operations.
 */
export function checkLedger(): LedgerMismatch[] {
  return getEngine().sqlite
    .prepare(
      `SELECT i.id AS inventory_item_id, i.on_hand AS on_hand, COALESCE(SUM(m.delta), 0) AS ledger
       FROM inventory_items i LEFT JOIN stock_movements m ON m.inventory_item_id = i.id
       GROUP BY i.id HAVING i.on_hand <> COALESCE(SUM(m.delta), 0)`,
    )
    .all() as LedgerMismatch[];
}
