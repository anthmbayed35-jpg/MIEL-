-- Flat delivery fee: one fee for every region, kept in settings ("delivery"). The per-zone fee column is no longer read; it is set to
-- the same flat $5.00 so the old numbers (3, 4, 5, 6) cannot be mistaken for live prices. The free-delivery lines (free_over_cents)
-- are NOT touched. Orders keep the fee they were created with: nothing in `orders` changes.
UPDATE shipping_zones SET fee_cents = 500;
