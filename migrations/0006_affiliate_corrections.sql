-- Visible balance corrections for affiliates.
-- A commission that was already PAID is never silently dropped when its order is later cancelled or returned:
--   the order becomes commission_status 'void' but KEEPS commission_payout_id (it was paid), which means "owed back".
--   The next payout deducts it and records which payout settled it in commission_correction_payout_id.
-- affiliate_payouts keeps the breakdown: gross approved commissions, corrections deducted, and the net amount actually paid.
ALTER TABLE orders ADD COLUMN commission_correction_payout_id TEXT REFERENCES affiliate_payouts(id);
ALTER TABLE affiliate_payouts ADD COLUMN gross_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payouts ADD COLUMN corrections_cents INTEGER NOT NULL DEFAULT 0;
UPDATE affiliate_payouts SET gross_cents = amount_cents WHERE gross_cents = 0;
CREATE INDEX orders_affiliate_corrections ON orders(affiliate_id) WHERE commission_status = 'void' AND commission_payout_id IS NOT NULL AND commission_correction_payout_id IS NULL;
