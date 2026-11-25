-- Checkout: a private link token for the confirmation page, the delivery address in parts, and a status for orders the customer
-- refused at the door. Existing orders keep all their data; they get a token so their link also works.

-- 1) The unguessable token of /order/<token> (128 random bits, hex) and the address in parts.
ALTER TABLE orders ADD COLUMN public_token TEXT;
UPDATE orders SET public_token = lower(hex(randomblob(16))) WHERE public_token IS NULL;
CREATE UNIQUE INDEX orders_public_token ON orders(public_token);
ALTER TABLE orders ADD COLUMN governorate TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN district TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN street TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN landmark TEXT NOT NULL DEFAULT '';

-- 2) Allow the status 'refused'. SQLite cannot ALTER a CHECK, and rebuilding `orders` would cascade-delete order_items, so the
--    documented "relax a CHECK" procedure is used (https://www.sqlite.org/lang_altertable.html, "Making Other Kinds Of Table
--    Schema Changes"): edit the stored definition, then force a schema reload with two harmless DDL statements.
--    It must come AFTER the ALTERs above (ALTER TABLE edits the stored text by position).
PRAGMA writable_schema = ON;
UPDATE sqlite_schema
   SET sql = replace(sql, '''cancelled'',''returned'')', '''cancelled'',''returned'',''refused'')')
 WHERE type = 'table' AND name = 'orders' AND sql LIKE '%''cancelled'',''returned'')%';
PRAGMA writable_schema = OFF;
CREATE TABLE _schema_reload (x INTEGER);
DROP TABLE _schema_reload;
