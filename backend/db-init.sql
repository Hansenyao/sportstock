-- ============================================================
-- SportStock — Database Initialization Script
-- PostgreSQL 14+
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- Drop Existing Objects (safe re-run)
-- ============================================================

-- Tables (reverse dependency order; CASCADE drops indexes, triggers, constraints)
DROP TABLE IF EXISTS stocktake_items     CASCADE;
DROP TABLE IF EXISTS user_invites        CASCADE;
DROP TABLE IF EXISTS stocktake_sessions  CASCADE;
DROP TABLE IF EXISTS fcm_tokens          CASCADE;
DROP TABLE IF EXISTS notifications       CASCADE;
DROP TABLE IF EXISTS stock_movements     CASCADE;
DROP TABLE IF EXISTS loans               CASCADE;
DROP TABLE IF EXISTS assets              CASCADE;
DROP TABLE IF EXISTS users               CASCADE;
DROP TABLE IF EXISTS asset_categories    CASCADE;
DROP TABLE IF EXISTS clubs               CASCADE;

-- Functions and procedures
DROP PROCEDURE IF EXISTS purchase_stock(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS retire_asset(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS complete_maintenance(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS return_loan(UUID, UUID, return_condition, TEXT);
DROP PROCEDURE IF EXISTS checkout_loan(UUID, UUID);
DROP PROCEDURE IF EXISTS reject_loan(UUID, UUID, TEXT);
DROP PROCEDURE IF EXISTS approve_loan(UUID, UUID);
DROP FUNCTION  IF EXISTS fn_check_low_stock()          CASCADE;
DROP FUNCTION  IF EXISTS get_asset_depreciation(UUID)  CASCADE;
DROP FUNCTION  IF EXISTS fn_set_updated_at()           CASCADE;

-- Enum types
DROP TYPE IF EXISTS notification_type    CASCADE;
DROP TYPE IF EXISTS stock_movement_type  CASCADE;
DROP TYPE IF EXISTS return_condition     CASCADE;
DROP TYPE IF EXISTS loan_status          CASCADE;
DROP TYPE IF EXISTS asset_status         CASCADE;
DROP TYPE IF EXISTS user_role            CASCADE;


-- ============================================================
-- Enum Types
-- ============================================================

CREATE TYPE user_role AS ENUM (
    'super_admin',
    'club_admin',
    'asset_manager',
    'coach'
);

CREATE TYPE asset_status AS ENUM (
    'available',
    'on_loan',
    'maintenance',
    'retired'
);

CREATE TYPE loan_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'checked_out',
    'returned'
);

CREATE TYPE return_condition AS ENUM (
    'good',
    'minor_damage',
    'severe_damage'
);

CREATE TYPE stock_movement_type AS ENUM (
    'purchase',
    'loan_out',
    'loan_return',
    'write_off',
    'adjustment'
);

CREATE TYPE notification_type AS ENUM (
    'loan_request',
    'loan_approved',
    'loan_rejected',
    'loan_due_reminder',
    'loan_overdue',
    'low_stock',
    'return_initiated'
);


-- ============================================================
-- Tables
-- ============================================================

-- CLUBS: tenant root; one row = one tenant
CREATE TABLE clubs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    sport_type          VARCHAR(100),
    address             TEXT,
    contact_email       VARCHAR(255),
    logo_url            TEXT,
    -- default available-quantity threshold below which low-stock alerts fire
    low_stock_threshold INT         NOT NULL DEFAULT 2,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ASSET_CATEGORIES: system-wide defaults (club_id IS NULL) + per-club custom categories
CREATE TABLE asset_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID        REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    is_system   BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique name per club; separate unique index for system categories (club_id IS NULL)
CREATE UNIQUE INDEX uq_asset_categories_club_name
    ON asset_categories(club_id, name)
    WHERE club_id IS NOT NULL;

CREATE UNIQUE INDEX uq_asset_categories_system_name
    ON asset_categories(name)
    WHERE club_id IS NULL;

-- USERS: club members; super_admin rows have club_id = NULL
CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID        REFERENCES clubs(id) ON DELETE CASCADE,
    clerk_id    VARCHAR(255) NOT NULL UNIQUE,   -- Clerk user ID; no password stored
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    phone       VARCHAR(50),
    role        user_role   NOT NULL DEFAULT 'coach',
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT club_required_for_club_roles CHECK (
        role = 'super_admin' OR club_id IS NOT NULL
    )
);

-- ASSETS: equipment owned by a club
CREATE TABLE assets (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id             UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    category_id         UUID        REFERENCES asset_categories(id) ON DELETE SET NULL,
    name                VARCHAR(255) NOT NULL,
    total_quantity      INT         NOT NULL DEFAULT 1,
    available_quantity  INT         NOT NULL DEFAULT 1,
    status              asset_status NOT NULL DEFAULT 'available',
    brand               VARCHAR(100),
    model               VARCHAR(100),
    purchase_date       DATE,
    purchase_price      NUMERIC(12, 2),
    useful_life_years   INT,
    image_url           TEXT,
    qr_code             VARCHAR(255),
    -- per-asset override; NULL means fall back to clubs.low_stock_threshold
    low_stock_threshold INT,
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT total_qty_non_negative    CHECK (total_quantity >= 0),
    CONSTRAINT available_qty_non_negative CHECK (available_quantity >= 0),
    CONSTRAINT available_lte_total       CHECK (available_quantity <= total_quantity)
);

-- LOANS: borrow/return transaction lifecycle
CREATE TABLE loans (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id              UUID          NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_id             UUID          NOT NULL REFERENCES assets(id),
    coach_id             UUID          NOT NULL REFERENCES users(id),
    approved_by          UUID          REFERENCES users(id),
    checkout_by          UUID          REFERENCES users(id),
    return_confirmed_by  UUID          REFERENCES users(id),
    quantity             INT           NOT NULL DEFAULT 1,
    reason               TEXT,
    status               loan_status   NOT NULL DEFAULT 'pending',
    due_date             DATE          NOT NULL,
    rejection_reason     TEXT,
    checked_out_at       TIMESTAMPTZ,
    returned_at          TIMESTAMPTZ,
    return_condition     return_condition,
    return_notes         TEXT,
    due_reminder_sent_at TIMESTAMPTZ,
    overdue_notified_at  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT quantity_positive CHECK (quantity > 0)
);

-- STOCK_MOVEMENTS: append-only audit trail for every inventory change
CREATE TABLE stock_movements (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID                NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_id        UUID                NOT NULL REFERENCES assets(id),
    loan_id         UUID                REFERENCES loans(id) ON DELETE SET NULL,
    operator_id     UUID                REFERENCES users(id) ON DELETE SET NULL,
    type            stock_movement_type NOT NULL,
    quantity_delta  INT                 NOT NULL,
    quantity_before INT                 NOT NULL,
    quantity_after  INT                 NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- NOTIFICATIONS: in-app notification inbox per user
CREATE TABLE notifications (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID              NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        notification_type NOT NULL,
    title       VARCHAR(255)      NOT NULL,
    body        TEXT,
    data        JSONB,            -- arbitrary payload (e.g. loan_id, asset_id)
    is_read     BOOLEAN           NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- FCM_TOKENS: Firebase Cloud Messaging device registrations per user
CREATE TABLE fcm_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT        NOT NULL,
    device_info JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, token)
);

-- STOCKTAKE_SESSIONS: physical inventory counts (Phase 2)
CREATE TABLE stocktake_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    conducted_by UUID        NOT NULL REFERENCES users(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    notes        TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stocktake_status_check CHECK (status IN ('in_progress', 'completed', 'cancelled'))
);

-- USER_INVITES: pending club invitations (consumed on first login)
CREATE TABLE user_invites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    invited_by  UUID        NOT NULL REFERENCES users(id),
    email       VARCHAR(255) NOT NULL,
    role        user_role   NOT NULL DEFAULT 'coach',
    accepted_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_user_invites_pending ON user_invites(email, club_id) WHERE accepted_at IS NULL;
CREATE INDEX idx_user_invites_email ON user_invites(email) WHERE accepted_at IS NULL;

-- STOCKTAKE_ITEMS: per-asset physical count within a stocktake session
CREATE TABLE stocktake_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
    asset_id         UUID NOT NULL REFERENCES assets(id),
    system_quantity  INT  NOT NULL,
    physical_quantity INT NOT NULL,
    variance         INT  GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, asset_id)
);


-- ============================================================
-- Indexes
-- ============================================================

-- Users
CREATE INDEX idx_users_club_id  ON users(club_id);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);

-- Assets
CREATE INDEX idx_assets_club_id       ON assets(club_id);
CREATE INDEX idx_assets_club_status   ON assets(club_id, status);
CREATE INDEX idx_assets_club_category ON assets(club_id, category_id);

-- Loans
CREATE INDEX idx_loans_club_id       ON loans(club_id);
CREATE INDEX idx_loans_asset_id      ON loans(asset_id);
CREATE INDEX idx_loans_coach_id      ON loans(coach_id);
CREATE INDEX idx_loans_club_status   ON loans(club_id, status);
-- Partial index for overdue-check background job
CREATE INDEX idx_loans_active_due    ON loans(due_date) WHERE status = 'checked_out';

-- Stock movements
CREATE INDEX idx_stock_movements_club_id  ON stock_movements(club_id);
CREATE INDEX idx_stock_movements_asset_ts ON stock_movements(asset_id, created_at DESC);

-- Notifications
CREATE INDEX idx_notifications_user_ts ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread  ON notifications(user_id) WHERE is_read = false;


-- ============================================================
-- Functions
-- ============================================================

-- Shared trigger function: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Returns straight-line depreciation figures for an asset
CREATE OR REPLACE FUNCTION get_asset_depreciation(p_asset_id UUID)
RETURNS TABLE (
    asset_id              UUID,
    purchase_price        NUMERIC,
    annual_depreciation   NUMERIC,
    years_elapsed         NUMERIC,
    accumulated_depreciation NUMERIC,
    net_book_value        NUMERIC
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id AS asset_id,
        a.purchase_price,
        ROUND(a.purchase_price / a.useful_life_years, 2) AS annual_depreciation,
        ROUND(
            EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - a.purchase_date::TIMESTAMPTZ))
            / (365.25 * 86400.0),
            4
        ) AS years_elapsed,
        LEAST(
            a.purchase_price,
            ROUND(
                (a.purchase_price / a.useful_life_years) *
                EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - a.purchase_date::TIMESTAMPTZ))
                / (365.25 * 86400.0),
                2
            )
        ) AS accumulated_depreciation,
        GREATEST(
            0::NUMERIC,
            a.purchase_price - LEAST(
                a.purchase_price,
                ROUND(
                    (a.purchase_price / a.useful_life_years) *
                    EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - a.purchase_date::TIMESTAMPTZ))
                    / (365.25 * 86400.0),
                    2
                )
            )
        ) AS net_book_value
    FROM assets a
    WHERE a.id = p_asset_id
      AND a.purchase_price   IS NOT NULL
      AND a.purchase_date    IS NOT NULL
      AND a.useful_life_years IS NOT NULL
      AND a.useful_life_years > 0;
END;
$$;

-- Trigger function: fire low-stock notifications when available_quantity drops
-- to or below the threshold (per-asset override or club default)
CREATE OR REPLACE FUNCTION fn_check_low_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_threshold INT;
BEGIN
    -- Only care when qty decreases
    IF NEW.available_quantity >= OLD.available_quantity THEN
        RETURN NEW;
    END IF;

    v_threshold := COALESCE(
        NEW.low_stock_threshold,
        (SELECT low_stock_threshold FROM clubs WHERE id = NEW.club_id)
    );

    IF NEW.available_quantity <= v_threshold THEN
        INSERT INTO notifications (club_id, user_id, type, title, body, data)
        SELECT
            NEW.club_id,
            u.id,
            'low_stock'::notification_type,
            'Low Stock Alert',
            '"' || NEW.name || '" is running low (' || NEW.available_quantity || ' available)',
            jsonb_build_object(
                'asset_id',          NEW.id,
                'available_quantity', NEW.available_quantity,
                'threshold',          v_threshold
            )
        FROM users u
        WHERE u.club_id   = NEW.club_id
          AND u.role       IN ('asset_manager', 'club_admin')
          AND u.is_active  = true;
    END IF;

    RETURN NEW;
END;
$$;


-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER trg_clubs_updated_at
    BEFORE UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_loans_updated_at
    BEFORE UPDATE ON loans
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_fcm_tokens_updated_at
    BEFORE UPDATE ON fcm_tokens
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_asset_low_stock
    AFTER UPDATE OF available_quantity ON assets
    FOR EACH ROW EXECUTE FUNCTION fn_check_low_stock();


-- ============================================================
-- Stored Procedures
-- ============================================================

-- Approve a pending loan request
CREATE OR REPLACE PROCEDURE approve_loan(
    p_loan_id     UUID,
    p_approver_id UUID
) LANGUAGE plpgsql AS $$
BEGIN
    UPDATE loans
    SET status      = 'approved',
        approved_by = p_approver_id
    WHERE id = p_loan_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in pending status', p_loan_id;
    END IF;
END;
$$;

-- Reject a pending loan request
CREATE OR REPLACE PROCEDURE reject_loan(
    p_loan_id     UUID,
    p_approver_id UUID,
    p_reason      TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
BEGIN
    UPDATE loans
    SET status           = 'rejected',
        approved_by      = p_approver_id,
        rejection_reason = p_reason
    WHERE id = p_loan_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in pending status', p_loan_id;
    END IF;
END;
$$;

-- Confirm coach picked up the items; decrements available_quantity and logs movement
CREATE OR REPLACE PROCEDURE checkout_loan(
    p_loan_id     UUID,
    p_operator_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id       UUID;
    v_asset_id      UUID;
    v_quantity      INT;
    v_available_qty INT;
BEGIN
    SELECT club_id, asset_id, quantity
    INTO   v_club_id, v_asset_id, v_quantity
    FROM   loans
    WHERE  id = p_loan_id AND status = 'approved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in approved status', p_loan_id;
    END IF;

    SELECT available_quantity INTO v_available_qty
    FROM   assets
    WHERE  id = v_asset_id;

    IF v_available_qty < v_quantity THEN
        RAISE EXCEPTION
            'Insufficient stock for asset %: requested %, available %',
            v_asset_id, v_quantity, v_available_qty;
    END IF;

    UPDATE loans
    SET status         = 'checked_out',
        checkout_by    = p_operator_id,
        checked_out_at = NOW()
    WHERE id = p_loan_id;

    UPDATE assets
    SET available_quantity = available_quantity - v_quantity,
        status = CASE
                     WHEN available_quantity - v_quantity = 0 THEN 'on_loan'::asset_status
                     ELSE status
                 END
    WHERE id = v_asset_id;

    INSERT INTO stock_movements
        (club_id, asset_id, loan_id, operator_id, type,
         quantity_delta, quantity_before, quantity_after, notes)
    VALUES
        (v_club_id, v_asset_id, p_loan_id, p_operator_id, 'loan_out',
         -v_quantity, v_available_qty, v_available_qty - v_quantity,
         'Loan checked out');
END;
$$;

-- Confirm return; restores qty on good/minor damage or sends to maintenance on severe damage
CREATE OR REPLACE PROCEDURE return_loan(
    p_loan_id     UUID,
    p_operator_id UUID,
    p_condition   return_condition,
    p_notes       TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id        UUID;
    v_asset_id       UUID;
    v_quantity       INT;
    v_available_before INT;
BEGIN
    SELECT club_id, asset_id, quantity
    INTO   v_club_id, v_asset_id, v_quantity
    FROM   loans
    WHERE  id = p_loan_id AND status = 'checked_out';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in checked_out status', p_loan_id;
    END IF;

    SELECT available_quantity INTO v_available_before
    FROM   assets WHERE id = v_asset_id;

    UPDATE loans
    SET status               = 'returned',
        return_confirmed_by  = p_operator_id,
        returned_at          = NOW(),
        return_condition     = p_condition,
        return_notes         = p_notes
    WHERE id = p_loan_id;

    IF p_condition IN ('good'::return_condition, 'minor_damage'::return_condition) THEN
        UPDATE assets
        SET available_quantity = available_quantity + v_quantity,
            status             = 'available'::asset_status
        WHERE id = v_asset_id;

        INSERT INTO stock_movements
            (club_id, asset_id, loan_id, operator_id, type,
             quantity_delta, quantity_before, quantity_after, notes)
        VALUES
            (v_club_id, v_asset_id, p_loan_id, p_operator_id, 'loan_return',
             v_quantity, v_available_before, v_available_before + v_quantity,
             COALESCE(p_notes, 'Returned — condition: ' || p_condition::text));

    ELSE
        -- Severe damage: quantity stays out; asset goes to maintenance
        UPDATE assets
        SET status = 'maintenance'::asset_status
        WHERE id = v_asset_id;

        INSERT INTO stock_movements
            (club_id, asset_id, loan_id, operator_id, type,
             quantity_delta, quantity_before, quantity_after, notes)
        VALUES
            (v_club_id, v_asset_id, p_loan_id, p_operator_id, 'write_off',
             0, v_available_before, v_available_before,
             'Returned with severe damage — sent to maintenance');
    END IF;
END;
$$;

-- Mark maintenance done and restore available quantity
CREATE OR REPLACE PROCEDURE complete_maintenance(
    p_asset_id         UUID,
    p_operator_id      UUID,
    p_quantity_restored INT,
    p_notes            TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id        UUID;
    v_available_before INT;
BEGIN
    SELECT club_id, available_quantity
    INTO   v_club_id, v_available_before
    FROM   assets
    WHERE  id = p_asset_id AND status = 'maintenance';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset % is not in maintenance status', p_asset_id;
    END IF;

    UPDATE assets
    SET available_quantity = available_quantity + p_quantity_restored,
        status = CASE
                     WHEN available_quantity + p_quantity_restored > 0 THEN 'available'::asset_status
                     ELSE status
                 END
    WHERE id = p_asset_id;

    INSERT INTO stock_movements
        (club_id, asset_id, loan_id, operator_id, type,
         quantity_delta, quantity_before, quantity_after, notes)
    VALUES
        (v_club_id, p_asset_id, NULL, p_operator_id, 'adjustment',
         p_quantity_restored, v_available_before, v_available_before + p_quantity_restored,
         COALESCE(p_notes, 'Maintenance completed'));
END;
$$;

-- Decommission a quantity of an asset (write-off / retirement)
CREATE OR REPLACE PROCEDURE retire_asset(
    p_asset_id    UUID,
    p_operator_id UUID,
    p_quantity    INT,
    p_notes       TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id        UUID;
    v_total_qty      INT;
    v_available_before INT;
BEGIN
    SELECT club_id, total_quantity, available_quantity
    INTO   v_club_id, v_total_qty, v_available_before
    FROM   assets
    WHERE  id = p_asset_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset % not found', p_asset_id;
    END IF;

    IF p_quantity > v_total_qty THEN
        RAISE EXCEPTION
            'Cannot retire % units; total quantity is only %',
            p_quantity, v_total_qty;
    END IF;

    UPDATE assets
    SET total_quantity     = total_quantity - p_quantity,
        available_quantity = GREATEST(0, available_quantity - p_quantity),
        status = CASE
                     WHEN total_quantity - p_quantity <= 0 THEN 'retired'::asset_status
                     ELSE status
                 END
    WHERE id = p_asset_id;

    INSERT INTO stock_movements
        (club_id, asset_id, loan_id, operator_id, type,
         quantity_delta, quantity_before, quantity_after, notes)
    VALUES
        (v_club_id, p_asset_id, NULL, p_operator_id, 'write_off',
         -p_quantity, v_available_before, GREATEST(0, v_available_before - p_quantity),
         COALESCE(p_notes, 'Asset retired/decommissioned'));
END;
$$;

-- Add stock (new purchase or received donation)
CREATE OR REPLACE PROCEDURE purchase_stock(
    p_asset_id    UUID,
    p_operator_id UUID,
    p_quantity    INT,
    p_notes       TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id        UUID;
    v_available_before INT;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive, got %', p_quantity;
    END IF;

    SELECT club_id, available_quantity
    INTO   v_club_id, v_available_before
    FROM   assets
    WHERE  id = p_asset_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset % not found', p_asset_id;
    END IF;

    UPDATE assets
    SET total_quantity     = total_quantity + p_quantity,
        available_quantity = available_quantity + p_quantity,
        -- if previously retired and stock arrives, reactivate
        status = CASE WHEN status = 'retired' THEN 'available'::asset_status ELSE status END
    WHERE id = p_asset_id;

    INSERT INTO stock_movements
        (club_id, asset_id, loan_id, operator_id, type,
         quantity_delta, quantity_before, quantity_after, notes)
    VALUES
        (v_club_id, p_asset_id, NULL, p_operator_id, 'purchase',
         p_quantity, v_available_before, v_available_before + p_quantity,
         COALESCE(p_notes, 'Stock purchased/received'));
END;
$$;


-- ============================================================
-- Seed Data: system-wide asset categories
-- ============================================================

INSERT INTO asset_categories (club_id, name, is_system) VALUES
    (NULL, 'Balls',               true),
    (NULL, 'Training Equipment',  true),
    (NULL, 'Apparel & Gear',      true),
    (NULL, 'Facility Equipment',  true),
    (NULL, 'Office Supplies',     true);
