-- Step 1: Add factory-related columns to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS assigned_manufacturer_id uuid REFERENCES manufacturers(id),
  ADD COLUMN IF NOT EXISTS factory_status text,
  ADD COLUMN IF NOT EXISTS factory_amount numeric,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS factory_payment_date date,
  ADD COLUMN IF NOT EXISTS factory_payment_status text;

-- Step 2: Migrate existing data from orders to order_items
UPDATE order_items
SET
  assigned_manufacturer_id = orders.assigned_manufacturer_id,
  factory_status = orders.factory_status,
  factory_amount = orders.factory_amount,
  deadline = orders.deadline::date,
  factory_payment_date = orders.factory_payment_date::date,
  factory_payment_status = orders.factory_payment_status
FROM orders
WHERE order_items.order_id = orders.id
  AND orders.assigned_manufacturer_id IS NOT NULL;

-- Step 3: Create index for factory user queries
CREATE INDEX IF NOT EXISTS idx_order_items_manufacturer
  ON order_items(assigned_manufacturer_id)
  WHERE assigned_manufacturer_id IS NOT NULL;

-- Step 4 (optional, run after code deployment stabilizes):
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS assigned_manufacturer_id,
--   DROP COLUMN IF EXISTS factory_status,
--   DROP COLUMN IF EXISTS factory_amount,
--   DROP COLUMN IF EXISTS deadline,
--   DROP COLUMN IF EXISTS factory_payment_date,
--   DROP COLUMN IF EXISTS factory_payment_status;
