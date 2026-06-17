# SportStock v2 Refactor — Technical Specification

> Status: Draft · Last updated: 2026-06-01
> Scope: 7 requirements, all targeting the `dev` branch.
> No data migration — db-init.sql will be fully rewritten.

---

## Table of Contents

1. [REQ-1 User Registration & Multi-Club Support](#req-1)
2. [REQ-2 System Audit Logs](#req-2)
3. [REQ-3 Accountant Role](#req-3)
4. [REQ-4 Configurable Sport Types](#req-4)
5. [REQ-5 Kits (Equipment Bundles)](#req-5)
6. [REQ-6 Warehouse & Individual Item Tracking](#req-6)
7. [REQ-7 Menu & Navigation Rename](#req-7)
8. [Cross-cutting: Permission Matrix](#permission-matrix)

---

## REQ-1: User Registration & Multi-Club Support {#req-1}

### Problem

Current model couples `users.club_id` and `users.role` at the row level — one user = one club. A coach in two clubs needs two accounts.

### Design

Decouple user identity from club membership. Users exist independently; membership + role live in a junction table.

### Schema Changes

**Drop from `users`:** `club_id`, `role`, and the `CONSTRAINT club_required_for_club_roles` check.

**Add to `users`:** `is_super_admin BOOLEAN NOT NULL DEFAULT false` (replaces the `super_admin` enum value; super_admin is a platform-level flag, not a club role).

```sql
-- Users: platform identity only, no club binding
CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    phone           VARCHAR(50),
    is_super_admin  BOOLEAN      NOT NULL DEFAULT false,
    email_verified  BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Club memberships: one row per (user, club) pair
CREATE TABLE club_memberships (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        club_role   NOT NULL,       -- see new enum below
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    invited_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    joined_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

-- New enum: roles that exist within a club context
-- (super_admin is now a users.is_super_admin flag, not a role here)
CREATE TYPE club_role AS ENUM (
    'club_admin',
    'asset_manager',
    'coach',
    'accountant'
);
```

**Drop:** `user_role` enum (replaced by `club_role` + `users.is_super_admin`).

**`clubs` table:** add `owner_id UUID REFERENCES users(id)` — the founding admin (denormalized for quick lookup). Remove `admin_user_id` if it exists.

```sql
-- Pending invitations (before the invited user accepts)
CREATE TABLE club_invitations (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID      NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    invitee_id  UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by  UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        club_role NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending'  -- pending | accepted | declined | cancelled
        CHECK (status IN ('pending','accepted','declined','cancelled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- Only one *pending* invite per user per club; re-inviting after accept/decline/cancel is allowed
CREATE UNIQUE INDEX idx_club_invitations_pending
    ON club_invitations(club_id, invitee_id)
    WHERE status = 'pending';
```

Accepting an invitation: inserts into `club_memberships`, sets `club_invitations.status = 'accepted'`.
Declining: sets `club_invitations.status = 'declined'`.
Club admin can cancel a pending invite: sets `status = 'cancelled'`.
If user is already a member of the club, invitation cannot be created.

### Auth Flow Changes

| Endpoint | Old Behaviour | New Behaviour |
|----------|--------------|---------------|
| `POST /auth/register` | Creates club + club_admin user atomically | Creates **user only** (no club). Sends OTP for email verification. **Current stage: OTP hardcoded to `"123456"`, no actual email sent.** |
| `POST /auth/register-club` *(new)* | — | Authenticated user creates a new club; caller auto-assigned `club_admin` membership. |
| `POST /auth/login` | Returns JWT with `club_id`, `role` | Returns JWT with `user_id`, `is_super_admin`, plus `clubs[]` (array of club memberships) |
| `POST /auth/select-club` *(new)* | — | Exchanges a `club_id` for a scoped JWT containing `active_club_id` + `role`. |
| `POST /clubs/:id/invitations` *(new)* | — | Club admin searches user by name/email, selects role, sends in-app invitation. Creates a pending `club_invitations` row + in-app notification to the target user. **Email notification to invitee: reserved, not implemented in current stage.** |
| `POST /clubs/:id/invitations/:id/accept` *(new)* | — | Invited user accepts from the notification; creates `club_memberships` row with `joined_at = NOW()`. |
| `POST /clubs/:id/invitations/:id/decline` *(new)* | — | Invited user declines a pending invitation. |
| `DELETE /clubs/:id/invitations/:id` *(new)* | — | Club admin cancels a pending invitation. |

### JWT Structure

```json
// Unscoped token (issued at login, before club selection)
{
  "sub": "<user_id>",
  "email": "...",
  "first_name": "...",
  "last_name": "...",
  "is_super_admin": false,
  "clubs": [
    { "club_id": "...", "club_name": "...", "role": "coach" },
    { "club_id": "...", "club_name": "...", "role": "asset_manager" }
  ]
}

// Scoped token (issued after POST /auth/select-club)
{
  "sub": "<user_id>",
  "email": "...",
  "first_name": "...",
  "last_name": "...",
  "is_super_admin": false,
  "active_club_id": "...",
  "role": "coach"
}
```

Backend middleware reads `active_club_id` and `role` from the scoped token. All club-scoped API calls require a scoped token.

### Login Flow Logic

```
Login succeeds
  ├── is_super_admin = true  →  issue unscoped token; redirect to super admin dashboard
  ├── clubs.length = 0       →  issue unscoped token; frontend shows "no club" onboarding state
  ├── clubs.length = 1       →  auto-select; issue scoped token; redirect to club dashboard
  └── clubs.length > 1       →  issue unscoped token; frontend shows club-picker UI
```

### Frontend Changes

- **Login page:** handle unscoped token; if multi-club → show club picker modal/page before entering dashboard.
- **Top toolbar:** show active club name + switcher dropdown (visible when user has >1 club).
- **No-club dashboard state:** full-page empty state — "You are not a member of any club yet. Ask a club admin to invite you."
- **Register page:** remove club name/sport type fields; registration is user-only. Replace single Name field with **First Name** + **Last Name** fields.
- **New "Create Club" flow:** accessible after login from the empty state or user settings.

---

## REQ-2: System Audit Logs {#req-2}

### Schema

```sql
CREATE TABLE audit_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id      UUID        REFERENCES clubs(id) ON DELETE SET NULL,  -- NULL = system-level action
    user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(80) NOT NULL,   -- e.g. 'asset.create', 'loan.approve', 'user.invite'
    entity_type  VARCHAR(50),            -- e.g. 'asset_type', 'loan', 'user'
    entity_id    UUID,
    meta         JSONB,                  -- relevant context snapshot (no PII)
    ip_address   VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_club    ON audit_logs(club_id, created_at DESC);
CREATE INDEX idx_audit_logs_global  ON audit_logs(created_at DESC);
```

### Actions to Log

| Domain | Actions |
|--------|---------|
| Auth | `auth.login`, `auth.register`, `auth.password_reset` |
| Club | `club.create`, `club.update`, `club.register` |
| Membership | `membership.invite`, `membership.accept`, `membership.role_change`, `membership.deactivate` |
| Asset | `asset_type.create`, `asset_type.update`, `asset_type.deactivate`, `asset_batch.add`, `asset_item.create`, `asset_item.update`, `asset_item.retire`, `asset_item.write_off` |
| Loan | `loan.create`, `loan.approve`, `loan.reject`, `loan.checkout`, `loan.return` |
| Inventory | `inventory.adjust`, `inventory.stocktake` |
| Kit | `kit.create`, `kit.update`, `kit.delete` |
| Settings | `sport_type.create`, `sport_type.update`, `sport_type.delete` |

### Implementation

Backend service layer (`AuditLogService`) called after each successful write operation. Pass `club_id`, `user_id`, `action`, `entity_type`, `entity_id`, and a small `meta` snapshot. Do not log passwords or tokens.

### API

```
GET /api/v1/audit-logs                    # Club admin — own club only (club_id from JWT)
  ?from=ISO_DATE&to=ISO_DATE&action=&entity_type=&page=&limit=

GET /api/v1/admin/audit-logs              # Super admin — all clubs
  ?club_id=&from=&to=&action=&entity_type=&page=&limit=
```

---

## REQ-3: Accountant Role {#req-3}

### New Role Value

Add `'accountant'` to the `club_role` enum.

### Permission Scope

| Feature | club_admin | asset_manager | coach | accountant |
|---------|-----------|---------------|-------|------------|
| Inventory (browse assets) | ✓ | ✓ | ✓ (read) | ✓ (read) |
| Asset financial data (price, depreciation) | ✓ | ✓ | ✗ | ✓ |
| Create / edit asset types & batches | ✓ | ✓ | ✗ | ✗ |
| Add / edit asset items | ✓ | ✓ | ✗ | ✗ |
| Loans — submit request | ✓ | ✓ | ✓ | ✗ |
| Loans — view list (read-only) | ✓ | ✓ | ✓ | ✓ |
| Loans — approve / checkout / return | ✓ | ✓ | ✗ | ✗ |
| Warehouses — manage (CRUD) | ✓ | ✓ | ✗ | ✗ |
| Stock Management | ✓ | ✓ | ✗ | ✗ |
| Financial reports (depreciation, asset value) | ✓ | ✓ | ✗ | ✓ |
| Audit logs | ✓ | ✗ | ✗ | ✗ |
| User management | ✓ | ✗ | ✗ | ✗ |
| Kits | ✓ | ✓ | ✗ | ✗ |

Accountant is read-only for everything except financial reports — they can view and export.

---

## REQ-4: Configurable Sport Types {#req-4}

### Schema

```sql
CREATE TABLE sport_types (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    sort_order INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- clubs.sport_type VARCHAR → FK
ALTER TABLE clubs
    DROP COLUMN sport_type,
    ADD COLUMN sport_type_id UUID REFERENCES sport_types(id) ON DELETE SET NULL;
```

### Seed Data

```sql
INSERT INTO sport_types (name, sort_order) VALUES
    ('Soccer',      1),
    ('Football',    2),
    ('Basketball',  3),
    ('Swimming',    4),
    ('Tennis',      5),
    ('Baseball',    6),
    ('Other',       99);
```

### API

```
# Public (used by club registration dropdown)
GET  /api/v1/sport-types                          # returns active types only

# Super admin — Settings
GET    /api/v1/admin/settings/sport-types         # all (incl. inactive)
POST   /api/v1/admin/settings/sport-types
PUT    /api/v1/admin/settings/sport-types/:id
DELETE /api/v1/admin/settings/sport-types/:id     # soft-delete (set is_active=false) if clubs reference it
```

### Super Admin UI

New **Settings** section in super admin sidebar. Initial tab: **Sport Types** — table with name, active toggle, sort order, edit/delete actions.

---

## REQ-5: Kits (Equipment Bundles) {#req-5}

### Schema

```sql
CREATE TABLE kits (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, name)
);

CREATE TABLE kit_items (
    id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id         UUID  NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
    asset_type_id  UUID  NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    quantity       INT   NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE(kit_id, asset_type_id)
);
```

### API

```
GET    /api/v1/kits               # list active kits for current club
POST   /api/v1/kits               # create kit (admin, asset_manager)
GET    /api/v1/kits/:id           # kit detail with items + availability check
PUT    /api/v1/kits/:id           # update name/description
DELETE /api/v1/kits/:id           # soft-delete
POST   /api/v1/kits/:id/items     # add item { asset_type_id, quantity }
PUT    /api/v1/kits/:id/items/:itemId   # update quantity
DELETE /api/v1/kits/:id/items/:itemId  # remove item
```

`GET /api/v1/kits/:id` response includes `is_available: boolean` and per-item `available_quantity` computed from current stock.

### Loan Creation Integration

Loan creation UI adds an **"Add from Kit"** button. The kit list only shows kits where **all items have sufficient stock** (`is_available = true`). Unavailable kits are greyed out with a reason tooltip. Selecting an available kit:
1. Fetches kit detail (items + quantities)
2. Merges kit items into the loan cart (same type items are summed if already in cart)

Stock is re-validated server-side when the loan is submitted.

The loan itself records individual `loan_items` — kits are a UI convenience only, not stored on the loan.

---

## REQ-6: Warehouse & Individual Item Tracking {#req-6}

### Design Principle

- **DB layer:** individual item granularity (`asset_items`)
- **UI layer:** aggregated display by asset_type/batch — no UX change
- **Loan layer:** request remains type + quantity; item assignment happens at checkout
- `asset_batches` retained for purchase/depreciation/financial tracking; quantity fields become derived

### Schema

#### New: Warehouses

```sql
CREATE TABLE warehouses (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     UUID         NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(club_id, name)
);
```

#### New: Asset Items

```sql
CREATE TYPE asset_item_status AS ENUM (
    'available',
    'on_loan',
    'maintenance',
    'retired',
    'written_off'
);

CREATE TABLE asset_items (
    id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id         UUID              NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    asset_type_id   UUID              NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT,
    batch_id        UUID              REFERENCES asset_batches(id) ON DELETE SET NULL,
    warehouse_id    UUID              NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    serial_number   VARCHAR(100),     -- optional internal/external ID
    status          asset_item_status NOT NULL DEFAULT 'available',
    notes           TEXT,
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_items_type      ON asset_items(asset_type_id, status);
CREATE INDEX idx_asset_items_batch     ON asset_items(batch_id);
CREATE INDEX idx_asset_items_warehouse ON asset_items(warehouse_id);
```

#### Modified: `asset_batches`

Remove `available_quantity` (derived from `asset_items` count). Keep `total_quantity` as the purchased quantity (immutable record). Keep all financial fields.

```sql
-- Retain: id, asset_type_id, purchase_date, purchase_price, useful_life_years,
--         total_quantity, notes, created_at, updated_at
-- Remove: available_quantity, status (status is now per-item)
```

A computed view for backward-compat aggregation:

```sql
CREATE VIEW asset_batch_summary AS
SELECT
    b.id,
    b.asset_type_id,
    b.total_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'available')    AS available_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'on_loan')      AS on_loan_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'maintenance')  AS maintenance_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'retired')      AS retired_quantity,
    COUNT(i.id) FILTER (WHERE i.status = 'written_off')  AS written_off_quantity,
    b.purchase_date,
    b.purchase_price,
    b.useful_life_years,
    b.notes,
    b.created_at
FROM asset_batches b
LEFT JOIN asset_items i ON i.batch_id = b.id
GROUP BY b.id;
```

#### Modified: Loan Checkout — Item Assignment

When a loan is checked out, the system assigns specific `asset_items` to each `loan_item`:

```sql
-- New junction: records which specific items are assigned to a loan_item
CREATE TABLE loan_item_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_item_id  UUID NOT NULL REFERENCES loan_items(id) ON DELETE CASCADE,
    asset_item_id UUID NOT NULL REFERENCES asset_items(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(asset_item_id)  -- one item cannot be on two loans simultaneously
);
```

`loan_items` retains `asset_type_id + quantity` (unchanged). On checkout:
1. Find `quantity` available `asset_items` for the `asset_type_id` (FIFO by `created_at`).
2. Insert `loan_item_assignments` rows.
3. Set `asset_items.status = 'on_loan'`.

On return:
1. Look up `loan_item_assignments` for this loan_item.
2. Set `asset_items.status = 'available'` (or `'maintenance'` if damaged).
3. Delete the `loan_item_assignments` rows.

#### Modified: Write-offs

`write_off_orders` gains `asset_item_id UUID REFERENCES asset_items(id)` (nullable — for manual item-level write-offs). On write-off, `asset_items.status = 'written_off'`.

#### Modified: Stock Movements

`stock_movements` adds `asset_item_id UUID REFERENCES asset_items(id)` (nullable). Movements that affect individual items (loan_out, loan_return, write_off) record the item ID. Batch-level adjustments (purchase) may be NULL.

#### Financial calculation: unchanged from current system

Net book value and depreciation remain **batch-level and time-based only** — `purchase_price` is not adjusted when individual items are retired or written off. This matches the existing system behavior.

#### UI: batch operations for items without serial numbers

When items have no serial number, the UI allows operators to retire or write off a quantity (e.g., "retire 3 of this type") rather than selecting individual items. The backend creates the status change on that many `asset_item` rows (FIFO by `created_at`).

### New API Endpoints

```
# Warehouses
GET    /api/v1/warehouses
POST   /api/v1/warehouses
PUT    /api/v1/warehouses/:id
DELETE /api/v1/warehouses/:id

# Asset Items (individual item management)
GET    /api/v1/assets/:typeId/items                    # list items for a type (with warehouse, status, SN)
POST   /api/v1/assets/:typeId/items                    # add item(s) to a batch
PUT    /api/v1/assets/items/:itemId                    # update warehouse, serial_number, notes
POST   /api/v1/assets/:typeId/items/retire             # retire by quantity (batch op, no SN required)
POST   /api/v1/assets/items/:itemId/retire             # retire specific item (when SN known)
POST   /api/v1/assets/:typeId/items/write-off          # write off by quantity (batch op)
POST   /api/v1/assets/items/:itemId/write-off          # write off specific item
```

Adding items to a batch creates one `asset_items` row per unit (e.g., "add 10 footballs to batch X" → 10 rows).

---

## REQ-7: Menu & Navigation Rename {#req-7}

### Changes

| Old | New | Scope |
|-----|-----|-------|
| "Assets" (sidebar menu item) | "Inventory" | Frontend sidebar + page title |
| Stock Operations + Stocktake (currently under Inventory API) | "Stock Management" (new sidebar section) | Frontend sidebar |

### Visibility

| Menu Item | club_admin | asset_manager | coach | accountant |
|-----------|-----------|---------------|-------|------------|
| Inventory | ✓ | ✓ | ✓ | ✓ |
| Loans | ✓ | ✓ | ✓ | ✓ (read-only) |
| Stock Management | ✓ | ✓ | ✗ | ✗ |
| Kits | ✓ | ✓ | ✗ | ✗ |
| Teams | ✓ | ✗ | ✗ | ✗ |
| Users | ✓ | ✗ | ✗ | ✗ |
| Audit Logs | ✓ | ✗ | ✗ | ✗ |
| Reports | ✓ | ✓ | ✗ | ✓ |

Backend API paths are unchanged (renaming is UI-only).

---

## Cross-Cutting: Permission Matrix {#permission-matrix}

### Middleware Changes

Current: `req.user.club_id`, `req.user.role` injected from JWT.
New: same fields, but sourced from the **scoped JWT** (after `POST /auth/select-club`).

Super admin routes use `req.user.is_super_admin` (from either token type).

Unscoped token can only access: `GET /auth/me`, `POST /auth/select-club`, `POST /auth/register-club`, `GET /sport-types`.

### Key Open Decisions

1. **Invitation flow:** ✅ Resolved — club admin searches user in-system, no email. In-app notification sent. User accepts/declines in notification center. Pending invitations stored in `club_invitations` table.
2. **Accountant sees loan list?** ✅ Resolved — read-only access to loan list granted.
3. **Warehouse required?** ✅ Resolved — `warehouse_id` is required on `asset_items`. If only one warehouse exists for the club, it is auto-selected in the UI. Warehouse management (CRUD) is accessible to club_admin and asset_manager from the club dashboard (same pattern as Asset Names).
4. **Kit availability check:** ✅ Resolved — availability is checked at the moment of kit selection. If any item in the kit has insufficient stock, the kit is marked unavailable and cannot be selected (hard block, no warning-and-continue).
5. **Audit log retention:** ✅ Resolved — indefinite retention for now. Schema is designed for future partitioning: `created_at` is the partition key candidate. When volume becomes a concern, migrate to range partitioning by month (`PARTITION BY RANGE (created_at)`) and archive old partitions to cold storage. No action needed now; keep the design in mind.
