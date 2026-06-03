-- Add payment_method column to orders table
-- Stores the WooCommerce payment gateway slug (e.g. 'stripe', 'bacs')
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Backfill existing orders from the woo_data JSONB column
UPDATE orders
SET payment_method = woo_data->>'payment_method'
WHERE woo_data IS NOT NULL
  AND woo_data->>'payment_method' IS NOT NULL
  AND payment_method IS NULL;
