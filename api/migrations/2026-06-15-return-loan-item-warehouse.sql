-- Allow return_loan_item to optionally redirect returned items to a different warehouse.
-- When p_warehouse_id is NULL the items stay in their original warehouse.

DROP PROCEDURE IF EXISTS return_loan_item(UUID, VARCHAR);

CREATE OR REPLACE PROCEDURE return_loan_item(
    p_loan_item_id UUID,
    p_condition    VARCHAR,
    p_warehouse_id UUID DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_new_status asset_item_status;
BEGIN
    v_new_status := CASE p_condition
        WHEN 'good'    THEN 'available'::asset_item_status
        WHEN 'damaged' THEN 'maintenance'::asset_item_status
        ELSE                'written_off'::asset_item_status
    END;

    UPDATE asset_items ai
    SET    status       = v_new_status,
           warehouse_id = COALESCE(p_warehouse_id, ai.warehouse_id),
           updated_at   = NOW()
    FROM   loan_item_assignments lia
    WHERE  lia.loan_item_id  = p_loan_item_id
      AND  lia.asset_item_id = ai.id;

    DELETE FROM loan_item_assignments
    WHERE loan_item_id = p_loan_item_id;
END;
$$;
