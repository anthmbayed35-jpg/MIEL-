-- Indexes found missing by the QA audit with ~5,000 orders / ~2,000 customers (each backs a list, filter or report):
CREATE INDEX IF NOT EXISTS orders_region_created ON orders(region, created_at);          -- orders list filtered by region
CREATE INDEX IF NOT EXISTS orders_discount_code ON orders(discount_code) WHERE discount_code IS NOT NULL; -- discount usage report
CREATE INDEX IF NOT EXISTS orders_cod_settlement ON orders(cod_collected, cod_settled_at);  -- partner COD settlement
CREATE INDEX IF NOT EXISTS orders_delivery_partner_cod ON orders(delivery_partner_id, cod_collected);
CREATE INDEX IF NOT EXISTS stock_movements_created ON stock_movements(created_at);        -- "latest movements" without sorting the table
CREATE INDEX IF NOT EXISTS stock_movements_reason ON stock_movements(reason, created_at);
CREATE INDEX IF NOT EXISTS abandoned_created ON abandoned_checkouts(created_at);
CREATE INDEX IF NOT EXISTS customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS products_status_created ON products(status, created_at);
CREATE INDEX IF NOT EXISTS order_events_created ON order_events(created_at);
