-- Test orders: an admin previewing the hidden storefront (SITE_MODE=maintenance) may place an order ONLY if it is
-- explicitly marked and confirmed as a test. The flag keeps such orders out of sales statistics and shows a TEST badge.
ALTER TABLE orders ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_is_test ON orders(is_test);
