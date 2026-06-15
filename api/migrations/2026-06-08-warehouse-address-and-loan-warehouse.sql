-- Migration: 2026-06-08
-- 1. Add address column to warehouses
-- 2. Add warehouse_id to loans
-- 3. Update approve_loan stored procedure (new warehouse_id parameter)
-- 4. Update checkout_loan stored procedure (filter items by warehouse)

-- ── 1. warehouses.address ─────────────────────────────────────────────────────

ALTER TABLE warehouses
    ADD COLUMN IF NOT EXISTS address VARCHAR(255);

-- ── 2. loans.warehouse_id ─────────────────────────────────────────────────────

ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;

-- ── 3. approve_loan (drop old 2-arg version, create 3-arg version) ────────────

-- PostgreSQL does NOT replace a procedure when the parameter count changes;
-- the old overload must be dropped explicitly first.
DROP PROCEDURE IF EXISTS approve_loan(UUID, UUID);

CREATE OR REPLACE PROCEDURE approve_loan(
    p_loan_id      UUID,
    p_approver_id  UUID,
    p_warehouse_id UUID DEFAULT NULL
) LANGUAGE plpgsql AS $$
BEGIN
    UPDATE loans
    SET status       = 'approved',
        approved_by  = p_approver_id,
        warehouse_id = p_warehouse_id
    WHERE id = p_loan_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in pending status', p_loan_id;
    END IF;
END;
$$;

-- ── 4. checkout_loan (reads warehouse_id from loan, filters asset_items) ───────

CREATE OR REPLACE PROCEDURE checkout_loan(p_loan_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    v_item           RECORD;
    v_li             RECORD;
    v_assigned_count INT;
    v_warehouse_id   UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM loans WHERE id = p_loan_id;

    FOR v_li IN
        SELECT li.id, li.asset_type_id, li.quantity
        FROM   loan_items li
        WHERE  li.loan_id = p_loan_id
    LOOP
        FOR v_item IN
            SELECT ai.id
            FROM   asset_items ai
            WHERE  ai.asset_type_id = v_li.asset_type_id
              AND  ai.status        = 'available'
              AND  ai.club_id       = (SELECT club_id FROM loans WHERE id = p_loan_id)
              AND  (v_warehouse_id IS NULL OR ai.warehouse_id = v_warehouse_id)
            ORDER BY ai.created_at
            LIMIT  v_li.quantity
        LOOP
            INSERT INTO loan_item_assignments(loan_item_id, asset_item_id)
            VALUES (v_li.id, v_item.id);

            UPDATE asset_items
            SET    status     = 'on_loan',
                   updated_at = NOW()
            WHERE  id = v_item.id;
        END LOOP;

        SELECT COUNT(*) INTO v_assigned_count
        FROM loan_item_assignments
        WHERE loan_item_id = v_li.id;

        IF v_assigned_count < v_li.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for asset_type_id %: need %, found %',
                v_li.asset_type_id, v_li.quantity, v_assigned_count
                USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    UPDATE loans
    SET status     = 'checked_out',
        updated_at = NOW()
    WHERE id = p_loan_id;
END;
$$;
