-- Influencer affiliate programme. Purely additive: no existing table loses a column or a row.
--   affiliates              one row per influencer; `code` is their checkout code (stored UPPERCASE, unique)
--   affiliate_payouts       every payout recorded by the team
--   affiliate_applications  the public /ambassadors form
--   orders.*                which affiliate an order came from and what it earned (money in integer cents)
-- Rates are stored x100 (15% = 1500) like discounts.value_x100.
CREATE TABLE affiliates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instagram_handle TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 20),
  tier TEXT NOT NULL DEFAULT 'seed' CHECK (tier IN ('seed','athlete','ambassador')),
  commission_rate_x100 INTEGER NOT NULL DEFAULT 1500 CHECK (commission_rate_x100 BETWEEN 0 AND 10000),
  customer_discount_percent_x100 INTEGER NOT NULL DEFAULT 1000 CHECK (customer_discount_percent_x100 BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  payout_method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  private_token TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX affiliate_payouts_affiliate ON affiliate_payouts(affiliate_id, paid_at);

CREATE TABLE affiliate_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instagram_handle TEXT NOT NULL DEFAULT '',
  tiktok_handle TEXT NOT NULL DEFAULT '',
  followers TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  sport TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX affiliate_applications_status ON affiliate_applications(status, created_at);

ALTER TABLE orders ADD COLUMN affiliate_id TEXT REFERENCES affiliates(id);
ALTER TABLE orders ADD COLUMN code_used TEXT;
ALTER TABLE orders ADD COLUMN discount_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN commission_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN commission_status TEXT CHECK (commission_status IN ('pending','approved','paid','void'));
ALTER TABLE orders ADD COLUMN commission_payout_id TEXT REFERENCES affiliate_payouts(id);
CREATE INDEX orders_affiliate ON orders(affiliate_id, commission_status);
