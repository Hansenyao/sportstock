-- ============================================================
-- SportStock — Database Initialization Script
-- PostgreSQL 14+
-- Schema v2: multi-club memberships, per-item asset tracking,
--            warehouses, kits, audit logs
-- ============================================================

-- ============================================================
-- Drop Existing Objects (safe re-run)
-- ============================================================

-- Tables (reverse dependency order; CASCADE drops indexes, triggers, constraints)
DROP TABLE IF EXISTS audit_logs              CASCADE;
DROP TABLE IF EXISTS kit_items               CASCADE;
DROP TABLE IF EXISTS kits                    CASCADE;
DROP TABLE IF EXISTS stocktake_items         CASCADE;
DROP TABLE IF EXISTS stocktake_sessions      CASCADE;
DROP TABLE IF EXISTS fcm_tokens              CASCADE;
DROP TABLE IF EXISTS notifications           CASCADE;
DROP TABLE IF EXISTS stock_movements         CASCADE;
DROP TABLE IF EXISTS write_off_orders        CASCADE;
DROP TABLE IF EXISTS loan_item_assignments   CASCADE;
DROP TABLE IF EXISTS loan_items              CASCADE;
DROP TABLE IF EXISTS loans                   CASCADE;
DROP TABLE IF EXISTS asset_items             CASCADE;
DROP TABLE IF EXISTS asset_batches           CASCADE;
DROP TABLE IF EXISTS warehouses              CASCADE;
DROP TABLE IF EXISTS asset_types             CASCADE;
DROP TABLE IF EXISTS asset_names             CASCADE;
DROP TABLE IF EXISTS team_members            CASCADE;
DROP TABLE IF EXISTS teams                   CASCADE;
DROP TABLE IF EXISTS asset_categories        CASCADE;
DROP TABLE IF EXISTS club_invitations        CASCADE;
DROP TABLE IF EXISTS club_memberships        CASCADE;
DROP TABLE IF EXISTS email_verifications     CASCADE;
DROP TABLE IF EXISTS users                   CASCADE;
DROP TABLE IF EXISTS clubs                   CASCADE;
DROP TABLE IF EXISTS sport_types             CASCADE;

-- Views
DROP VIEW IF EXISTS asset_batch_summary;

-- Functions and procedures
DROP PROCEDURE IF EXISTS return_loan_item(UUID, VARCHAR);
DROP PROCEDURE IF EXISTS return_loan_item(UUID, VARCHAR, UUID);
DROP PROCEDURE IF EXISTS checkout_loan(UUID);
DROP PROCEDURE IF EXISTS complete_maintenance(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS retire_batch(UUID, UUID, INT, TEXT);
DROP PROCEDURE IF EXISTS checkout_loan(UUID, UUID);
DROP PROCEDURE IF EXISTS reject_loan(UUID, UUID, TEXT);
DROP PROCEDURE IF EXISTS approve_loan(UUID, UUID);
DROP FUNCTION  IF EXISTS fn_check_low_stock()         CASCADE;
DROP FUNCTION  IF EXISTS get_asset_depreciation(UUID) CASCADE;
DROP FUNCTION  IF EXISTS fn_set_updated_at()          CASCADE;

-- Enum types
DROP TYPE IF EXISTS notification_type   CASCADE;
DROP TYPE IF EXISTS write_off_source    CASCADE;
DROP TYPE IF EXISTS stock_movement_type CASCADE;
DROP TYPE IF EXISTS return_condition    CASCADE;
DROP TYPE IF EXISTS loan_status         CASCADE;
DROP TYPE IF EXISTS asset_item_status   CASCADE;
DROP TYPE IF EXISTS asset_status        CASCADE;
DROP TYPE IF EXISTS club_role           CASCADE;
DROP TYPE IF EXISTS user_role           CASCADE;


-- ============================================================
-- Enum Types
-- ============================================================

-- Club-scoped role (replaces user_role except super_admin, which is now a flag on users)
CREATE TYPE club_role AS ENUM (
    'club_admin',
    'asset_manager',
    'coach',
    'accountant'
);

-- Per-item asset status (replaces batch-level asset_status)
CREATE TYPE asset_item_status AS ENUM (
    'available',
    'on_loan',
    'maintenance',
    'retired',
    'written_off'
);

CREATE TYPE loan_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'checked_out',
    'returned'
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

-- SPORT_TYPES: normalized lookup replacing clubs.sport_type VARCHAR
CREATE TABLE sport_types (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    sort_order INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- CLUBS: tenant root; one club = one tenant
CREATE TABLE clubs (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(255) NOT NULL,
    sport_type_id         UUID         REFERENCES sport_types(id) ON DELETE SET NULL,
    address               TEXT,
    contact_email         VARCHAR(255),
    logo_url              TEXT,
    owner_id              UUID,        -- FK to users added after users table
    low_stock_threshold   INT          NOT NULL DEFAULT 2,
    retirement_alert_mode VARCHAR(10)  NOT NULL DEFAULT 'percent'
        CHECK (retirement_alert_mode IN ('months', 'percent')),
    retirement_alert_value INT         NOT NULL DEFAULT 80,
    is_active             BOOLEAN      NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- EMAIL_VERIFICATIONS: OTP codes for email verification and password reset
CREATE TABLE email_verifications (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL,
    code       VARCHAR(6)   NOT NULL,
    type       VARCHAR(20)  NOT NULL CHECK (type IN ('registration', 'password_reset')),
    expires_at TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_lookup
    ON email_verifications(email, type)
    WHERE used_at IS NULL;

-- USERS: platform users; no club_id or role — membership handled by club_memberships
CREATE TABLE users (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    phone          VARCHAR(50),
    avatar_url     VARCHAR(255),
    is_super_admin BOOLEAN      NOT NULL DEFAULT false,
    email_verified BOOLEAN      NOT NULL DEFAULT false,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Add clubs.owner_id FK now that users table exists
ALTER TABLE clubs
    ADD CONSTRAINT fk_clubs_owner
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- CLUB_MEMBERSHIPS: user <-> club junction with per-club role
CREATE TABLE club_memberships (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       club_role   NOT NULL,
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    invited_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    joined_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active membership row per user per club
CREATE UNIQUE INDEX idx_club_memberships_unique ON club_memberships(club_id, user_id);

-- CLUB_INVITATIONS: pending in-app invitations
CREATE TABLE club_invitations (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    invitee_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         club_role   NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- Only one pending invite per user per club; re-inviting after resolve is allowed
CREATE UNIQUE INDEX idx_club_invitations_pending
    ON club_invitations(club_id, invitee_id)
    WHERE status = 'pending';

-- ASSET_CATEGORIES: system-wide defaults (club_id IS NULL) + per-club custom categories
CREATE TABLE asset_categories (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    UUID         REFERENCES clubs(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    is_system  BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Unique name per club; separate unique index for system categories (club_id IS NULL)
CREATE UNIQUE INDEX uq_asset_categories_club_name
    ON asset_categories(club_id, name)
    WHERE club_id IS NOT NULL;

CREATE UNIQUE INDEX uq_asset_categories_system_name
    ON asset_categories(name)
    WHERE club_id IS NULL;

-- TEAMS: coaching teams within a club
CREATE TABLE teams (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    gender     VARCHAR(10)  NOT NULL CHECK (gender IN ('Boys', 'Girls', 'Mixed')),
    age_group  VARCHAR(10)  NOT NULL CHECK (age_group IN ('U4','U5','U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','U20','U21','Adult')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- TEAM_MEMBERS: many-to-many coaches <-> teams
CREATE TABLE team_members (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id   UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_role VARCHAR(20) NOT NULL CHECK (team_role IN ('head_coach', 'assistant_coach', 'team_manager')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

-- Enforce: each team may have at most one head coach
CREATE UNIQUE INDEX uq_team_head_coach ON team_members(team_id) WHERE team_role = 'head_coach';

-- ── Asset catalog (3-table model) ────────────────────────────────────────────

-- ASSET_NAMES: approved name catalog per club
CREATE TABLE asset_names (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    category_id UUID         REFERENCES asset_categories(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, name)
);

-- ASSET_TYPES: one row per unique (name + brand + model + size) combination per club
CREATE TABLE asset_types (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id             UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_name_id       UUID         NOT NULL REFERENCES asset_names(id) ON DELETE RESTRICT,
    brand               VARCHAR(100),
    model               VARCHAR(100),
    size                VARCHAR(100),
    image_url           TEXT,
    low_stock_threshold INT,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Treat NULL brand/model/size as empty string for dedup purposes (NULLs are distinct in UNIQUE)
CREATE UNIQUE INDEX uq_asset_types_combination
    ON asset_types(club_id, asset_name_id, COALESCE(brand,''), COALESCE(model,''), COALESCE(size,''));

-- WAREHOUSES: physical storage locations within a club
CREATE TABLE warehouses (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, name)
);

-- ASSET_BATCHES: one row per purchase event; no longer tracks qty/status (per-item now)
CREATE TABLE asset_batches (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type_id     UUID         NOT NULL REFERENCES asset_types(id) ON DELETE CASCADE,
    purchase_date     DATE,
    purchase_price    NUMERIC(12,2),
    useful_life_years INT,
    total_quantity    INT          NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
    notes             TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ASSET_ITEMS: individual physical items (the unit of tracking in v2)
CREATE TABLE asset_items (
    id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id       UUID              NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_type_id UUID              NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    batch_id      UUID              REFERENCES asset_batches(id) ON DELETE SET NULL,
    warehouse_id  UUID              NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    serial_number VARCHAR(100),
    status        asset_item_status NOT NULL DEFAULT 'available',
    notes         TEXT,
    created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_items_type      ON asset_items(asset_type_id, status);
CREATE INDEX idx_asset_items_batch     ON asset_items(batch_id);
CREATE INDEX idx_asset_items_warehouse ON asset_items(warehouse_id);

-- Computed view: batch-level availability aggregation
CREATE VIEW asset_batch_summary AS
SELECT
    b.id,
    b.asset_type_id,
    b.total_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'available')   AS available_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'on_loan')     AS on_loan_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'maintenance') AS maintenance_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'retired')     AS retired_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'written_off') AS written_off_quantity,
    b.purchase_date,
    b.purchase_price,
    b.useful_life_years,
    b.notes,
    b.created_at
FROM asset_batches b
LEFT JOIN asset_items i ON i.batch_id = b.id
GROUP BY b.id;

-- ── Loan lifecycle ────────────────────────────────────────────────────────────

-- LOANS: borrow/return transaction (multi-item; see loan_items)
CREATE TABLE loans (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id              UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    coach_id             UUID        NOT NULL REFERENCES users(id),
    team_id              UUID        REFERENCES teams(id) ON DELETE SET NULL,
    created_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
    approved_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    checkout_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    return_confirmed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    warehouse_id         UUID        REFERENCES warehouses(id) ON DELETE SET NULL,
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

-- LOAN_ITEMS: one row per asset_type within a loan
CREATE TABLE loan_items (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id               UUID        NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    asset_type_id         UUID        NOT NULL REFERENCES asset_types(id),
    quantity              INT         NOT NULL DEFAULT 1 CHECK (quantity > 0),
    kit_id                UUID        REFERENCES kits(id) ON DELETE SET NULL,
    kit_name              VARCHAR(100),
    kit_quantity          INT         CHECK (kit_quantity > 0),
    -- 4-bucket return breakdown (set on return; must sum to quantity)
    good_quantity         INT,
    minor_damage_quantity INT,
    write_off_quantity    INT,
    lost_quantity         INT,
    return_notes          TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LOAN_ITEM_ASSIGNMENTS: which specific asset_item fills each loan_item on checkout
CREATE TABLE loan_item_assignments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_item_id  UUID        NOT NULL REFERENCES loan_items(id) ON DELETE CASCADE,
    asset_item_id UUID        NOT NULL REFERENCES asset_items(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_item_id)   -- an item cannot be on two active loans simultaneously
);

CREATE INDEX idx_lia_loan_item_id ON loan_item_assignments(loan_item_id);

-- ── Write-offs ────────────────────────────────────────────────────────────────

-- WRITE_OFF_ORDERS: decommissioned assets (manual or from loan return)
CREATE TABLE write_off_orders (
    id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id       UUID             NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_type_id UUID             NOT NULL REFERENCES asset_types(id),
    asset_item_id UUID             REFERENCES asset_items(id) ON DELETE SET NULL,
    quantity      INT              NOT NULL CHECK (quantity > 0),
    reason        TEXT,
    source        write_off_source NOT NULL DEFAULT 'manual',
    loan_item_id  UUID             REFERENCES loan_items(id) ON DELETE SET NULL,
    created_by    UUID             NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes         TEXT,
    created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- STOCK_MOVEMENTS: append-only audit trail; references the specific batch and item affected
CREATE TABLE stock_movements (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID                NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_batch_id  UUID                REFERENCES asset_batches(id) ON DELETE SET NULL,
    asset_item_id   UUID                REFERENCES asset_items(id) ON DELETE SET NULL,
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
    id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    UUID              NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id    UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    title      VARCHAR(255)      NOT NULL,
    body       TEXT,
    data       JSONB,
    is_read    BOOLEAN           NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ       NOT NULL DEFAULT NOW()
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

-- STOCKTAKE_ITEMS: per-asset-type physical count within a stocktake session
CREATE TABLE stocktake_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
    asset_type_id     UUID NOT NULL REFERENCES asset_types(id),
    system_quantity   INT  NOT NULL,
    physical_quantity INT  NOT NULL,
    variance          INT  GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, asset_type_id)
);

-- KITS: named bundles of asset types for quick loan creation
CREATE TABLE kits (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, name)
);

CREATE TABLE kit_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id        UUID NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
    asset_type_id UUID NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    quantity      INT  NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE (kit_id, asset_type_id)
);

-- AUDIT_LOGS: immutable record of every significant action
CREATE TABLE audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID        REFERENCES clubs(id) ON DELETE SET NULL,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(80) NOT NULL,
    entity_type VARCHAR(50),
    entity_id   UUID,
    meta        JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_club   ON audit_logs(club_id, created_at DESC);
CREATE INDEX idx_audit_logs_global ON audit_logs(created_at DESC);


-- ============================================================
-- Indexes
-- ============================================================

-- Users
CREATE INDEX idx_users_email ON users(email);

-- Club memberships
CREATE INDEX idx_club_memberships_user_id ON club_memberships(user_id);
CREATE INDEX idx_club_memberships_club_id ON club_memberships(club_id);

-- Teams
CREATE INDEX idx_teams_club_id ON teams(club_id);

-- Team members
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- Asset names
CREATE INDEX idx_asset_names_club_id      ON asset_names(club_id);
CREATE INDEX idx_asset_names_club_category ON asset_names(club_id, category_id);

-- Asset types
CREATE INDEX idx_asset_types_club_id       ON asset_types(club_id);
CREATE INDEX idx_asset_types_asset_name_id ON asset_types(asset_name_id);
CREATE INDEX idx_asset_types_club_active   ON asset_types(club_id) WHERE is_active = true;

-- Asset batches
CREATE INDEX idx_asset_batches_type_id ON asset_batches(asset_type_id);

-- Loans
CREATE INDEX idx_loans_club_id     ON loans(club_id);
CREATE INDEX idx_loans_coach_id    ON loans(coach_id);
CREATE INDEX idx_loans_team_id     ON loans(team_id);
CREATE INDEX idx_loans_club_status ON loans(club_id, status);
-- Partial index for overdue-check background job
CREATE INDEX idx_loans_active_due  ON loans(due_date) WHERE status = 'checked_out';

-- Loan items
CREATE INDEX idx_loan_items_loan_id       ON loan_items(loan_id);
CREATE INDEX idx_loan_items_asset_type_id ON loan_items(asset_type_id);

-- Write-off orders
CREATE INDEX idx_write_off_orders_club_id       ON write_off_orders(club_id);
CREATE INDEX idx_write_off_orders_asset_type_id ON write_off_orders(asset_type_id);

-- Stock movements
CREATE INDEX idx_stock_movements_club_id  ON stock_movements(club_id);
CREATE INDEX idx_stock_movements_batch_ts ON stock_movements(asset_batch_id, created_at DESC);

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

-- Returns straight-line depreciation figures for a single asset batch
CREATE OR REPLACE FUNCTION get_asset_depreciation(p_batch_id UUID)
RETURNS TABLE (
    batch_id                 UUID,
    asset_type_id            UUID,
    purchase_price           NUMERIC,
    annual_depreciation      NUMERIC,
    years_elapsed            NUMERIC,
    accumulated_depreciation NUMERIC,
    net_book_value           NUMERIC
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        ab.id                                                           AS batch_id,
        ab.asset_type_id,
        ab.purchase_price,
        ROUND(ab.purchase_price / ab.useful_life_years, 2)             AS annual_depreciation,
        ROUND(
            EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - ab.purchase_date::TIMESTAMPTZ))
            / (365.25 * 86400.0),
            4
        )                                                               AS years_elapsed,
        LEAST(
            ab.purchase_price,
            ROUND(
                (ab.purchase_price / ab.useful_life_years) *
                EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - ab.purchase_date::TIMESTAMPTZ))
                / (365.25 * 86400.0),
                2
            )
        )                                                               AS accumulated_depreciation,
        GREATEST(
            0::NUMERIC,
            ab.purchase_price - LEAST(
                ab.purchase_price,
                ROUND(
                    (ab.purchase_price / ab.useful_life_years) *
                    EXTRACT(EPOCH FROM (CURRENT_DATE::TIMESTAMPTZ - ab.purchase_date::TIMESTAMPTZ))
                    / (365.25 * 86400.0),
                    2
                )
            )
        )                                                               AS net_book_value
    FROM asset_batches ab
    WHERE ab.id = p_batch_id
      AND ab.purchase_price    IS NOT NULL
      AND ab.purchase_date     IS NOT NULL
      AND ab.useful_life_years IS NOT NULL
      AND ab.useful_life_years > 0;
END;
$$;


-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER trg_sport_types_updated_at
    BEFORE UPDATE ON sport_types
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_clubs_updated_at
    BEFORE UPDATE ON clubs
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_warehouses_updated_at
    BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_asset_types_updated_at
    BEFORE UPDATE ON asset_types
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_asset_batches_updated_at
    BEFORE UPDATE ON asset_batches
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_asset_items_updated_at
    BEFORE UPDATE ON asset_items
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

CREATE TRIGGER trg_kits_updated_at
    BEFORE UPDATE ON kits
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
-- Stored Procedures
-- ============================================================

-- Approve a pending loan request
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

-- Confirm coach picked up items.
--   Assigns specific available asset_items FIFO (oldest created first) per loan_item.
--   Marks each assigned item as on_loan.
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

        -- Verify enough items were assigned
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

-- Process return of a single loan_item: set each assigned item's status based on condition.
--   p_condition: 'good' -> available, 'damaged' -> maintenance, anything else -> written_off
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


-- ============================================================
-- Seed Data
-- ============================================================

-- Sport types
INSERT INTO sport_types (name, sort_order) VALUES
    ('Soccer',     1),
    ('Football',   2),
    ('Basketball', 3),
    ('Swimming',   4),
    ('Tennis',     5),
    ('Baseball',   6),
    ('Other',      99);

-- System-wide asset categories (club_id IS NULL = shared across all clubs)
INSERT INTO asset_categories (club_id, name, is_system) VALUES
    (NULL, 'Balls',              true),
    (NULL, 'Training Equipment', true),
    (NULL, 'Apparel & Gear',     true),
    (NULL, 'Facility Equipment', true),
    (NULL, 'Office Supplies',    true);

-- Default super admin account
-- Credentials: admin@sportstock.com / Admin@SportStock2024
-- Change the password immediately after first login.
INSERT INTO users (email, password_hash, first_name, last_name, is_super_admin, email_verified, is_active)
VALUES (
    'admin@sportstock.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Super', 'Admin',
    true, true, true
) ON CONFLICT (email) DO NOTHING;
