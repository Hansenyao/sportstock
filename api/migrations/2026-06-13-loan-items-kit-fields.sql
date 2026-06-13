-- Migration: add kit attribution columns to loan_items
-- Apply once to the live Azure DB via psql or SQL client.

ALTER TABLE loan_items
    ADD COLUMN IF NOT EXISTS kit_id       UUID        REFERENCES kits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kit_name     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS kit_quantity INT         CHECK (kit_quantity > 0);
