# SportStock — Project Context

> This file is maintained by Claude to preserve project context across sessions.
> Last updated: 2026-05-02

---

## What This Project Is

**SportStock** is a multi-tenant SaaS platform for asset management, targeting small youth sports clubs (football, basketball, swimming, tennis, etc.).

The core problem: clubs own lots of equipment but manage it informally. SportStock digitizes this via a responsive web app — PC, Pad, and Phone all served by one React frontend.

---

## Tech Stack (confirmed)

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js + ExpressJS (TypeScript) — deployed on Vercel |
| Database | PostgreSQL on Azure (`benchmarkersdb.postgres.database.azure.com / sportstock-db`) |
| Web frontend | React + Ant Design (responsive) — separate Vercel project |
| Auth | Platform-owned — email + bcrypt + JWT; OTP email verification via Resend |
| File storage | Supabase |
| Push | Firebase Cloud Messaging (Web Push) |

Clerk was removed entirely on 2026-04-24. No Clerk SDK anywhere.

---

## User Roles & Permissions

| Role | Key Permissions |
|------|----------------|
| `club_admin` | Register club, manage members/teams, approve loans |
| `asset_manager` | CRUD assets, process check-out/return, manage asset name catalog |
| `coach` | Browse assets, submit loan requests, confirm returns |
| `super_admin` | Platform operator — manages all clubs |

**Team roles** (`head_coach`, `assistant_coach`, `team_manager`) are **metadata labels only** — they do not grant additional system permissions. All three remain system role `coach`.

---

## Implementation Status (as of 2026-04-25)

### Completed — Backend
- Full Express/TypeScript REST API with JWT auth, bcrypt, Resend OTP
- `db-init.sql` schema v3: multi-item loans, write-off orders, 4-bucket return
- `scripts/seed-admin.ts` — default super admin (`admin@sportstock.com`)
- **Dev-only**: OTP hardcoded to `"123456"` (Resend call commented out — revert before prod)

#### Key schema (current, v3)
- `loan_items`: `quantity`, `good_quantity`, `minor_damage_quantity`, `write_off_quantity`, `lost_quantity`, `return_notes`
- `write_off_source` enum: `manual | loan_return | loan_lost`
- Stored procedures: `approve_loan`, `reject_loan`, `checkout_loan`, `complete_maintenance`, `retire_asset`, `purchase_stock`
- 5 system asset categories seeded at bottom of `db-init.sql`

#### Services implemented
- `loan.service.ts` — full lifecycle: create (cart), update, delete, approve, reject, checkout, confirmReturn (4-bucket), auto write-off orders
- `write-off.service.ts` — manual write-offs
- `asset.service.ts` — CRUD, categories, image upload (Supabase)
- `auth.service.ts`, `user.service.ts`, `notification.service.ts`

### Completed — Frontend
Pages: Login, Register (3-step OTP), ForgotPassword, Dashboard (overview + pending loans widget), Assets (list/filters/create/edit/write-off), Loans (full lifecycle with cart drawer), Write-offs (list + create), Users (list + create/edit)

Key architecture:
- `src/api/client.ts` — Axios + 401 interceptor
- `src/contexts/AuthContext.tsx` — validates token on startup via `GET /auth/me`
- `src/pages/Loans/index.tsx` — cart in localStorage (`sportstock_loan_cart`), expandable rows, 4-bucket return modal

### Known issues / pending
- Real Resend email not wired up (OTP is `123456`)
- No "lost item recovery" flow (schema supports it via `loan_lost` source)
- Phase 2: depreciation reports, QR scanning, bulk CSV import, stocktake

---

## Pending Requirements — 2026-05-02

### REQ-1: Team Structure

**Source:** `docs/initial.md` — "调整club的组织结构、增加team"

#### What changes
1. Admin can create multiple teams per club (attributes: name, gender, age_group)
2. Coach–Team relationship is **many-to-many**: one coach can join multiple teams with different roles
3. Team roles (`head_coach | assistant_coach | team_manager`) are **metadata labels only** — no permission change, all remain system role `coach`
4. One team can have **only one Head Coach**, but multiple Assistant Coaches and Team Managers
5. Team assignment is managed from **Team management** (connect existing coaches when editing a team) — adding a coach to the system remains unchanged (no team assigned by default)
6. Viewing a coach's profile shows all teams they belong to and their role in each
7. Admin dashboard left sidebar gets a Teams management menu item
8. Loans list supports filtering by team

#### Schema changes
```sql
-- New: teams table
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES clubs(id),
  name       VARCHAR(100) NOT NULL,
  gender     VARCHAR(10) NOT NULL CHECK (gender IN ('Boys', 'Girls', 'Mixed')),
  age_group  VARCHAR(10) NOT NULL,  -- 'U4'..'U21', 'Adult'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- New: junction table (many-to-many coaches <-> teams)
CREATE TABLE team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_role  VARCHAR(20) NOT NULL CHECK (team_role IN ('head_coach','assistant_coach','team_manager')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id)  -- one role per coach per team
);

-- Head Coach uniqueness per team
CREATE UNIQUE INDEX team_members_head_coach_unique
  ON team_members (team_id) WHERE team_role = 'head_coach';
```

**`users` table requires NO changes.**

#### Backend changes
- New `/api/v1/teams` CRUD (scoped by `club_id`)
- Team member management:
  - `POST /api/v1/teams/:id/members` — add coach to team with a role
  - `PUT /api/v1/teams/:id/members/:userId` — change role
  - `DELETE /api/v1/teams/:id/members/:userId` — remove from team
- `GET /api/v1/users/:id` — response includes coach's team memberships array
- `GET /api/v1/loans` — accept `team_id` query param (JOIN through `team_members`)
- Head Coach conflict → return 409 with clear error message

#### Frontend changes
- Left sidebar: "Teams" menu item (admin only)
- Teams list page: show each team's basic info and member count
- Create/Edit Team modal:
  - Basic fields: name, gender dropdown, age_group dropdown
  - Members section: select existing coaches + assign role; Head Coach conflict warning
- User detail view (coach): show all team memberships with roles
- Loans page: team filter dropdown

**Difficulty: ⭐⭐⭐ Medium**
**Risk: Low** — `users` table untouched; purely additive (two new tables + new API + new page)

---

### REQ-2: Asset Name Catalog + Batch Aggregation

**Source:** `docs/initial.md` — "调整club的资产管理，Asset Name必须是Admin或者是Asset Manager预先创建好的名字"

#### What changes
1. Each club maintains an **Asset Name Catalog** (`asset_names` table)
2. When creating assets, name must be selected from catalog — no free-text input
3. Same (name + brand + model + size) assets display as **one aggregated row** in the list; each purchase is a separate batch for future depreciation tracking
4. Loans operate at the aggregated level — no need to distinguish batches on checkout
5. **All existing DB data can be wiped** (testing phase) — no migration needed

#### New schema (replaces current `assets` table)
```sql
-- Asset name catalog per club
CREATE TABLE asset_names (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES clubs(id),
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, name)
);

-- Asset type / group — one row per unique (name+brand+model+size) per club
CREATE TABLE asset_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       UUID NOT NULL REFERENCES clubs(id),
  asset_name_id UUID NOT NULL REFERENCES asset_names(id),
  brand         VARCHAR(100),
  model         VARCHAR(100),
  size          VARCHAR(50),
  category_id   UUID REFERENCES asset_categories(id),
  image_url     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (club_id, asset_name_id, brand, model, size)
);

-- Asset batch — one row per purchase
CREATE TABLE asset_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type_id    UUID NOT NULL REFERENCES asset_types(id),
  purchase_date    DATE,
  purchase_price   NUMERIC(10,2),
  useful_life_years INT,
  total_quantity   INT NOT NULL DEFAULT 0,
  available_quantity INT NOT NULL DEFAULT 0,
  status           VARCHAR(20) NOT NULL DEFAULT 'available',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

#### Loan deduction logic
- `loan_items` references `asset_type_id` (not batch)
- Available check: `SELECT SUM(available_quantity) FROM asset_batches WHERE asset_type_id = X`
- Deduction on checkout: decrement from batches in purchase_date ASC order until quantity satisfied (order is arbitrary since batches are treated equally per REQ-2.4)

#### Backend changes
- New `/api/v1/asset-names` CRUD
- `asset.service.ts` rewritten: multi-table operations (asset_types + asset_batches)
- `GET /api/v1/assets` — GROUP BY asset_type, return aggregated quantities + `batches[]` array
- `loan.service.ts` — checkout deduction now spans batches for same asset_type

#### Frontend changes
- Asset Names management page (or sub-section in Assets page)
- Asset creation redesigned: Step 1 — select/create asset type (pick name from catalog, enter brand/model/size); Step 2 — fill purchase batch details
- Asset list: grouped rows showing aggregated quantity; expandable to see individual batches
- Loan cart: references asset_type, availability check uses aggregate

**Difficulty: ⭐⭐⭐ Medium** (was ⭐⭐⭐⭐ before; simplified by no-batch-distinction on loans + free DB wipe)
**Risk: Medium** — core asset + loan tables restructured; requires DB reset and full rewrite of asset/loan services

---

## Implementation Status

### REQ-1: Teams — COMPLETE (2026-05-02)

All backend and frontend changes shipped:
- `teams` + `team_members` tables in db-init.sql
- `loans.team_id` nullable FK (+ index); `LOAN_SELECT` includes `team_name`
- `/api/v1/teams` CRUD + member management (add/update-role/remove)
- `loan.service.ts`: team validation on create, direct `l.team_id` filter on list
- `user.service.ts`: `getUser` returns `teams[]` array
- Frontend: Teams page, sidebar nav, Users coach-detail modal, Loans team filter + tag, loan create team selector
- **Design decision**: `team_id` on loans is optional — coaches without teams can still borrow

### REQ-2: Asset Catalog + Batches — NOT STARTED

Next to implement. Requires full DB reset (re-run db-init.sql).

---

## Deployment

- Backend: `https://sportstock-api.vercel.app`
- Frontend: separate Vercel project
- DB reset procedure: re-run full `db-init.sql` (stored procedures + seed data live in the script)
- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction — run separately

---

## Open Questions

- [ ] Redis hosting provider (needed for background jobs in Phase 2)
- [ ] Offline caching strategy for poor-network venues
- [ ] Data privacy requirements for youth member data
- [ ] Business / pricing model
