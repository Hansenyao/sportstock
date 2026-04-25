-- ============================================================
-- SportStock — Database Initialization Script
-- PostgreSQL 14+
-- ============================================================

-- ============================================================
-- Drop Existing Objects (safe re-run)
-- ============================================================

-- Tables (reverse dependency order; CASCADE drops indexes, triggers, constraints)
DROP TABLE IF EXISTS stocktake_items      CASCADE;
DROP TABLE IF EXISTS stocktake_sessions   CASCADE;
DROP TABLE IF EXISTS fcm_tokens           CASCADE;
DROP TABLE IF EXISTS notifications        CASCADE;
DROP TABLE IF EXISTS write_off_orders     CASCADE;
DROP TABLE IF EXISTS stock_movements      CASCADE;
DROP TABLE IF EXISTS loan_items           CASCADE;
DROP TABLE IF EXISTS loans                CASCADE;
DROP TABLE IF EXISTS assets               CASCADE;
DROP TABLE IF EXISTS users                CASCADE;
DROP TABLE IF EXISTS asset_categories     CASCADE;
DROP TABLE IF EXISTS clubs                CASCADE;
DROP TABLE IF EXISTS email_verifications  CASCADE;

-- Functions and procedures
DROP PROCEDURE IF EXISTS purchase_stock(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS retire_asset(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS complete_maintenance(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS checkout_loan(UUID, UUID);
DROP PROCEDURE IF EXISTS reject_loan(UUID, UUID, TEXT);
DROP PROCEDURE IF EXISTS approve_loan(UUID, UUID);
DROP FUNCTION  IF EXISTS fn_check_low_stock()          CASCADE;
DROP FUNCTION  IF EXISTS get_asset_depreciation(UUID)  CASCADE;
DROP FUNCTION  IF EXISTS fn_set_updated_at()           CASCADE;

-- Enum types
DROP TYPE IF EXISTS notification_type    CASCADE;
DROP TYPE IF EXISTS write_off_source     CASCADE;
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

CREATE TYPE write_off_source AS ENUM (
    'manual',
    'loan_return',
    'loan_lost'
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

-- EMAIL_VERIFICATIONS: OTP codes for email verification and password reset
CREATE TABLE email_verifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(6)  NOT NULL,
    type       VARCHAR(20) NOT NULL CHECK (type IN ('registration', 'password_reset')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_lookup
    ON email_verifications(email, type)
    WHERE used_at IS NULL;

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

-- USERS: platform users; super_admin rows have club_id = NULL
-- Authentication: email + bcrypt-hashed password; no external auth provider
CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID        REFERENCES clubs(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    role            user_role   NOT NULL DEFAULT 'coach',
    email_verified  BOOLEAN     NOT NULL DEFAULT false,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    size                VARCHAR(100),
    purchase_date       DATE,
    purchase_price      NUMERIC(12, 2),
    useful_life_years   INT,
    image_url           TEXT,
    asset_tag           VARCHAR(50),
    qr_code             VARCHAR(255),
    -- per-asset override; NULL means fall back to clubs.low_stock_threshold
    low_stock_threshold INT,
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT total_qty_non_negative     CHECK (total_quantity >= 0),
    CONSTRAINT available_qty_non_negative CHECK (available_quantity >= 0),
    CONSTRAINT available_lte_total        CHECK (available_quantity <= total_quantity)
);

-- LOANS: borrow/return transaction lifecycle (multi-item; see loan_items)
CREATE TABLE loans (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id              UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    coach_id             UUID        NOT NULL REFERENCES users(id),
    created_by           UUID        REFERENCES users(id),
    approved_by          UUID        REFERENCES users(id),
    checkout_by          UUID        REFERENCES users(id),
    return_confirmed_by  UUID        REFERENCES users(id),
    reason               TEXT,
    status               loan_status NOT NULL DEFAULT 'pending',
    due_date             DATE        NOT NULL,
    rejection_reason     TEXT,
    checked_out_at       TIMESTAMPTZ,
    returned_at          TIMESTAMPTZ,
    return_notes         TEXT,
    due_reminder_sent_at TIMESTAMPTZ,
    overdue_notified_at  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LOAN_ITEMS: one row per asset within a loan
CREATE TABLE loan_items (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id               UUID        NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    asset_id              UUID        NOT NULL REFERENCES assets(id),
    quantity              INT         NOT NULL DEFAULT 1 CHECK (quantity > 0),
    -- 4-bucket return breakdown (set on return; must sum to quantity)
    good_quantity         INT,
    minor_damage_quantity INT,
    write_off_quantity    INT,
    lost_quantity         INT,
    return_notes          TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WRITE_OFF_ORDERS: records of decommissioned assets (manual or triggered from loan return)
CREATE TABLE write_off_orders (
    id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      UUID             NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_id     UUID             NOT NULL REFERENCES assets(id),
    quantity     INT              NOT NULL CHECK (quantity > 0),
    reason       TEXT,
    source       write_off_source NOT NULL DEFAULT 'manual',
    loan_item_id UUID             REFERENCES loan_items(id) ON DELETE SET NULL,
    created_by   UUID             NOT NULL REFERENCES users(id),
    notes        TEXT,
    created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- STOCK_MOVEMENTS: append-only audit trail for every inventory change
CREATE TABLE stock_movements (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID                NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_id        UUID                NOT NULL REFERENCES assets(id),
    loan_id         UUID                REFERENCES loans(id) ON DELETE SET NULL,
    loan_item_id    UUID                REFERENCES loan_items(id) ON DELETE SET NULL,
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
    data        JSONB,
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

-- STOCKTAKE_ITEMS: per-asset physical count within a stocktake session
CREATE TABLE stocktake_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
    asset_id          UUID NOT NULL REFERENCES assets(id),
    system_quantity   INT  NOT NULL,
    physical_quantity INT  NOT NULL,
    variance          INT  GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, asset_id)
);


-- ============================================================
-- Indexes
-- ============================================================

-- Users
CREATE INDEX idx_users_club_id ON users(club_id);
CREATE INDEX idx_users_email   ON users(email);

-- Assets
CREATE INDEX idx_assets_club_id       ON assets(club_id);
CREATE INDEX idx_assets_club_status   ON assets(club_id, status);
CREATE INDEX idx_assets_club_category ON assets(club_id, category_id);

-- Loans
CREATE INDEX idx_loans_club_id     ON loans(club_id);
CREATE INDEX idx_loans_coach_id    ON loans(coach_id);
CREATE INDEX idx_loans_club_status ON loans(club_id, status);
-- Partial index for overdue-check background job
CREATE INDEX idx_loans_active_due  ON loans(due_date) WHERE status = 'checked_out';

-- Loan items
CREATE INDEX idx_loan_items_loan_id  ON loan_items(loan_id);
CREATE INDEX idx_loan_items_asset_id ON loan_items(asset_id);

-- Write-off orders
CREATE INDEX idx_write_off_orders_club_id  ON write_off_orders(club_id);
CREATE INDEX idx_write_off_orders_asset_id ON write_off_orders(asset_id);

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
      AND a.purchase_price    IS NOT NULL
      AND a.purchase_date     IS NOT NULL
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
        WHERE u.club_id  = NEW.club_id
          AND u.role      IN ('asset_manager', 'club_admin')
          AND u.is_active = true;
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

CREATE TRIGGER trg_loan_items_updated_at
    BEFORE UPDATE ON loan_items
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_write_off_orders_updated_at
    BEFORE UPDATE ON write_off_orders
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

-- Confirm coach picked up items; decrements available_quantity per loan_item and logs movements
CREATE OR REPLACE PROCEDURE checkout_loan(
    p_loan_id     UUID,
    p_operator_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id   UUID;
    v_item      RECORD;
    v_avail_qty INT;
BEGIN
    SELECT club_id INTO v_club_id
    FROM   loans
    WHERE  id = p_loan_id AND status = 'approved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % is not in approved status', p_loan_id;
    END IF;

    -- Verify all items have sufficient stock before touching anything
    FOR v_item IN
        SELECT li.asset_id, li.quantity
        FROM   loan_items li
        WHERE  li.loan_id = p_loan_id
    LOOP
        SELECT available_quantity INTO v_avail_qty
        FROM   assets WHERE id = v_item.asset_id;

        IF v_avail_qty < v_item.quantity THEN
            RAISE EXCEPTION
                'Insufficient stock for asset %: requested %, available %',
                v_item.asset_id, v_item.quantity, v_avail_qty;
        END IF;
    END LOOP;

    UPDATE loans
    SET status         = 'checked_out',
        checkout_by    = p_operator_id,
        checked_out_at = NOW()
    WHERE id = p_loan_id;

    FOR v_item IN
        SELECT li.id AS item_id, li.asset_id, li.quantity
        FROM   loan_items li
        WHERE  li.loan_id = p_loan_id
    LOOP
        SELECT available_quantity INTO v_avail_qty
        FROM   assets WHERE id = v_item.asset_id;

        UPDATE assets
        SET available_quantity = available_quantity - v_item.quantity,
            status = CASE
                         WHEN available_quantity - v_item.quantity = 0 THEN 'on_loan'::asset_status
                         ELSE status
                     END
        WHERE id = v_item.asset_id;

        INSERT INTO stock_movements
            (club_id, asset_id, loan_id, loan_item_id, operator_id, type,
             quantity_delta, quantity_before, quantity_after, notes)
        VALUES
            (v_club_id, v_item.asset_id, p_loan_id, v_item.item_id, p_operator_id, 'loan_out',
             -v_item.quantity, v_avail_qty, v_avail_qty - v_item.quantity,
             'Loan checked out');
    END LOOP;
END;
$$;

-- Mark maintenance done and restore available quantity
CREATE OR REPLACE PROCEDURE complete_maintenance(
    p_asset_id          UUID,
    p_operator_id       UUID,
    p_quantity_restored INT,
    p_notes             TEXT DEFAULT NULL
) LANGUAGE plpgsql AS $$
DECLARE
    v_club_id          UUID;
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
    v_club_id          UUID;
    v_total_qty        INT;
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
    v_club_id          UUID;
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
-- Seed Data
-- ============================================================

-- System-wide asset categories
INSERT INTO asset_categories (club_id, name, is_system) VALUES
    (NULL, 'Balls',              true),
    (NULL, 'Training Equipment', true),
    (NULL, 'Apparel & Gear',     true),
    (NULL, 'Facility Equipment', true),
    (NULL, 'Office Supplies',    true);

-- NOTE: Default super admin must be created by running:
--   npx ts-node scripts/seed-admin.ts
-- Default credentials: admin@sportstock.com / Admin@SportStock2024
-- Change the password immediately after first login.
