# SportStock v2 Frontend — Technical Specification

> Status: Draft · Last updated: 2026-06-02
> Scope: Frontend implementation of the 7 v2 requirements.
> Backend: fully implemented on `dev` branch (244/244 tests pass).
> Reference: `docs/superpowers/specs/2026-06-01-v2-refactor-design.md`

---

## Table of Contents

1. [Implementation Strategy](#strategy)
2. [Foundation — Types, AuthContext, Routing](#foundation)
3. [Header & Club Switcher](#header)
4. [Auth Flows — Login, Register, Create Club](#auth-flows)
5. [New Pages](#new-pages)
6. [Updated Existing Pages](#updated-pages)
7. [Sidebar Navigation](#sidebar)
8. [Admin Area Changes](#admin)
9. [API Layer Changes](#api-layer)
10. [Route & Permission Matrix](#permissions)

---

## 1. Implementation Strategy {#strategy}

**Foundation-first in three phases:**

| Phase | Scope |
|-------|-------|
| **Phase 1 — Foundation** | Types rewrite, AuthContext rewrite, routing restructure, Header redesign |
| **Phase 2 — New pages** | Profile, My Clubs, Create Club, Warehouses, Kits, Audit Logs, Stock Management |
| **Phase 3 — Existing page updates** | Register form, Inventory (items drawer), Loans (kit integration), Reports rename, Sidebar reorganisation, Admin additions |

Phase 1 must land as a single atomic commit — it is a breaking change across the whole app. Phases 2 and 3 can be done in any order within their phase.

---

## 2. Foundation — Types, AuthContext, Routing {#foundation}

### 2.1 Types (`src/types/index.ts`)

Full rewrite. Old `AuthUser` (with `name`, `role`, `club_id`) is replaced by the v2 model.

```typescript
export type ClubRole = 'club_admin' | 'asset_manager' | 'coach' | 'accountant';

export interface ClubMembership {
  club_id: string;
  club_name: string;
  role: ClubRole;
}

// Returned by /auth/me and embedded in the unscoped JWT
export interface AuthUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;          // read-only, never editable
  phone?: string | null;
  is_super_admin: boolean;
  clubs: ClubMembership[];
}

// Set after POST /auth/select-club succeeds
export interface ActiveClub {
  club_id: string;
  club_name: string;
  role: ClubRole;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
```

### 2.2 AuthContext (`src/contexts/AuthContext.tsx`)

Full rewrite. Manages two independent token slots.

**State:**

| Field | Type | Description |
|-------|------|-------------|
| `unscopedToken` | `string \| null` | Issued at login. Required for `/auth/*` and personal endpoints. |
| `scopedToken` | `string \| null` | Issued by `/auth/select-club`. Required for all club-scoped endpoints. |
| `user` | `AuthUser \| null` | User profile from unscoped token. |
| `activeClub` | `ActiveClub \| null` | Currently selected club. `null` when user has no clubs or hasn't selected one yet. |
| `pendingInvitationCount` | `number` | Fetched once on login. Drives the header bell badge. |
| `isValidating` | `boolean` | True while verifying the stored token on app start. |

**Actions:**

| Method | Description |
|--------|-------------|
| `login(token, user)` | Stores unscoped token + user. Auto-calls `selectClub` with first club if `clubs.length >= 1`. Fetches pending invitation count. |
| `selectClub(clubId)` | Calls `POST /auth/select-club`, stores scoped token, updates `activeClub`. |
| `logout()` | Clears both tokens and all state. |
| `refreshInvitationCount()` | Re-fetches pending invitation count (called after accepting/declining an invitation). |

**Startup validation:** On mount, if `unscopedToken` exists in localStorage, call `GET /auth/me` with it. On success, restore `user` and re-select the previously active club (stored in localStorage as `active_club_id`). On failure, clear all storage.

**localStorage keys:** `unscoped_token`, `user`, `active_club_id`.

### 2.3 API Client (`src/api/client.ts`)

Two axios instances:

| Instance | Token used | Used for |
|----------|-----------|----------|
| `client` (default) | `scopedToken` | All club-scoped endpoints |
| `authClient` | `unscopedToken` | `/auth/*`, `/dashboard/profile`, `/dashboard/clubs` |

Both instances read tokens via a module-level token store — a plain object with `getUnscopedToken()` / `getScopedToken()` getters that `AuthContext` updates on every state change. No external state library required.

### 2.4 Routing (`src/router/index.tsx`)

Two route guards:

- **`RequireAuth`**: requires `unscopedToken`. Redirects to `/login` if absent.
- **`RequireClub`**: requires `activeClub`. Redirects to `/dashboard` if absent. Wraps all club-scoped pages.

```
/login                       LoginPage (updated CTAs)
/register-club               RegisterClubPage (club + admin combined form, updated)
/register-user               RegisterUserPage (user-only form, new)

/dashboard                   RequireAuth
  /dashboard                 DashboardPage (Overview — no club needed)
  /dashboard/profile         ProfilePage (new)
  /dashboard/clubs           MyClubsPage (new)
  /dashboard/create-club     CreateClubPage (new)

  RequireClub (activeClub required):
  /dashboard/warehouses      WarehousesPage (new)
  /dashboard/asset-names     AssetNamesPage (unchanged)
  /dashboard/inventory       InventoryPage (renamed from /assets)
  /dashboard/kits            KitsPage (new)
  /dashboard/loans           LoansPage (updated)
  /dashboard/stock           StockManagementPage (new, replaces /write-offs)
  /dashboard/reports         ReportsPage (renamed from /analytics)
  /dashboard/users           UsersPage (unchanged)
  /dashboard/teams           TeamsPage (unchanged)
  /dashboard/audit-logs      AuditLogsPage (new)
  /dashboard/settings        SettingsPage (unchanged)

/admin/*                     (unchanged)
```

Old routes that redirect:
- `/dashboard/assets` → `/dashboard/inventory` (301 redirect via `<Navigate>`)
- `/dashboard/write-offs` → `/dashboard/stock`
- `/dashboard/analytics` → `/dashboard/reports`
- `/register` → `/register-club` (old register route was club-scoped; redirect to keep old links working)

---

## 3. Header & Club Switcher {#header}

### Layout

```
[ Club Switcher ▼ ]                    [ 🔔² ]  [ Y  Youfang Yao ▼ ]
                                                    club_admin
```

**Left side — Club Switcher:**
- Displays the active club name. Styled as a button/tag (blue tinted).
- If `activeClub` is null (no clubs): shows "No Club" in grey.
- Click opens an Ant Design `Dropdown` with:
  - List of user's clubs (club name + role), current club highlighted with a checkmark.
  - Divider.
  - "+ Create New Club" option → navigates to `/dashboard/create-club`.
- Selecting a different club calls `selectClub(clubId)`; on success, React Router navigates to the current route (triggering a re-render with the new club context — no hard page reload).
- Hidden (or disabled) when user has only one club — still shows the club name but no dropdown arrow.

**Right side — Notification Bell:**
- Ant Design `Badge` wrapping a `BellOutlined` icon.
- Badge count = `pendingInvitationCount`. Hidden when 0.
- Click navigates to `/dashboard/clubs`.

**Right side — User Avatar Dropdown:**
- Shows first letter of `first_name` in avatar, full name below, role tag.
- Dropdown menu:
  - **Profile** → `/dashboard/profile`
  - **My Clubs** → `/dashboard/clubs` (shows badge count if > 0)
  - Divider
  - **Logout**

### No-club Dashboard State

When `activeClub` is null, `DashboardLayout` renders a minimal overview page:
- Sidebar shows only the "Overview" item.
- Main content shows a centred card:
  - "You are not a member of any club yet."
  - Two CTAs: "Create a Club" → `/dashboard/create-club`, "View Pending Invitations" → `/dashboard/clubs`.

---

## 4. Auth Flows {#auth-flows}

### 4.1 Login Flow

1. User submits email + password → `POST /auth/login`.
2. Response contains `{ token, user }` (unscoped).
3. `AuthContext.login()` is called:
   - `clubs.length === 0` → store unscoped token, `activeClub` stays null → redirect to `/dashboard` (no-club state).
   - `clubs.length === 1` → auto-call `selectClub(clubs[0].club_id)` → redirect to `/dashboard`.
   - `clubs.length > 1` → store unscoped token, call `selectClub(clubs[0].club_id)` (auto-select first) → redirect to `/dashboard`. User can switch club at any time via Header.
4. Fetch pending invitation count after login.

Super admin login: unchanged (uses `/admin/login` and `AdminAuthContext`).

### 4.2 Register Club Flow (`/register-club`, updated)

Combined form for club admin who is registering a new club. This is the existing registration flow, updated for v2 field changes.

**Section 1 — Your Account:**
- First Name (required) — was single `name` field
- Last Name (required)
- Email (required)
- Password (required)
- Phone (optional)

**Section 2 — Your Club:**
- Club Name (required)
- Sport Type (required) — dropdown from `GET /api/v1/sport-types`
- Address (optional)
- Contact Email (required)

**Submit:** `POST /api/v1/auth/register` (creates user) → OTP verification step (hardcoded `"123456"`) → auto-login → `POST /api/v1/auth/register-club` → `selectClub(newClubId)` → redirect to `/dashboard`.

**After success:** User lands in dashboard as `club_admin` of the new club.

### 4.3 Register User Flow (`/register-user`, new)

Simple self-service account creation for users who want to join an existing club. They create their account first; a club admin then finds and invites them in-system.

**Form fields:**
- First Name (required)
- Last Name (required)
- Email (required)
- Password (required)
- Phone (optional)

**Submit:** `POST /api/v1/auth/register` → OTP verification step → redirect to `/login`.

**After login:** User has no clubs → lands on no-club dashboard state with message: "Your account is ready. Ask a club admin to invite you, or create your own club."

### 4.4 Login Page CTAs (updated)

The bottom of the login page replaces the single "Register Your Club" button with two distinct CTAs:

```
──── New to SportStock? ────

[ Register a Club ]      [ Create an Account ]
  /register-club            /register-user
  (club admin)              (joining a club)
```

- **Register a Club** — for new club admins setting up a club
- **Create an Account** — for coaches / managers / accountants who will be invited by a club admin

### 4.5 Create Additional Club Flow (`/dashboard/create-club`)

For existing users (any role) who want to create an additional club after login.

Accessible from:
- Header club switcher → "+ Create New Club"
- No-club dashboard state CTA

**Form fields:**
- Club Name (required)
- Sport Type (required) — dropdown from `GET /api/v1/sport-types`
- Address (optional)
- Contact Email (required)

**Submit:** `POST /api/v1/auth/register-club`. Frontend calls `selectClub(newClubId)` → redirect to `/dashboard`.

---

## 5. New Pages {#new-pages}

### 5.1 Profile (`/dashboard/profile`)

Single card form using `authClient` (unscoped token).

**Fields:**
- Email — read-only, displayed as text (not an input)
- First Name — editable
- Last Name — editable
- Phone — editable (optional)
- Change Password section — current password + new password + confirm (separate `PUT /auth/password` call)

**Save:** `PUT /api/v1/users/me` on the profile fields. Password change is a separate button/section.

### 5.2 My Clubs (`/dashboard/clubs`)

Two sections:

**Pending Invitations** (shown only if count > 0):
- Table/list: club name, inviter name, role offered, date.
- Actions per row: Accept / Decline.
- Accept → `POST /clubs/:id/invitations/:invId/accept` → if `activeClub` is currently null, auto-calls `selectClub` with the new club; otherwise leaves the active club unchanged → `refreshInvitationCount()`.
- Decline → `POST /clubs/:id/invitations/:invId/decline` → `refreshInvitationCount()`.

**My Clubs:**
- Table: club name, sport type, role, joined date.
- No leave-club action (not in scope).

### 5.3 Warehouses (`/dashboard/warehouses`)

Mirrors the existing `AssetNamesPage` pattern:
- Table: name, description, active status, item count, created date.
- Add / Edit via modal form.
- Soft-delete (set `is_active = false`). Blocked if warehouse has active items (backend returns 409).
- Visible to: `club_admin`, `asset_manager`.

API: `GET/POST/PUT/DELETE /api/v1/warehouses`.

### 5.4 Kits (`/dashboard/kits`)

**List view:**
- Cards or table showing kit name, item count, availability status (`is_available`).
- Unavailable kits show a warning badge.
- Add / Edit / Delete via modal.

**Kit detail modal:**
- Kit name + description.
- Item list: asset type name, required quantity, current available quantity, availability status per item.
- "Add item" row: asset type picker + quantity input.

API: `GET/POST/PUT/DELETE /api/v1/kits` and `/api/v1/kits/:id/items`.

**Visible to:** `club_admin`, `asset_manager`.

### 5.5 Audit Logs (`/dashboard/audit-logs`)

Read-only table. Visible to `club_admin` only.

**Columns:** timestamp, action, entity type, entity ID, performed by (user name), IP.

**Filters:** date range, action type (dropdown), entity type.

**Pagination:** server-side.

API: `GET /api/v1/audit-logs`.

### 5.6 Stock Management (`/dashboard/stock`)

Replaces the old `/dashboard/write-offs` page. Consolidates write-offs and stocktake operations.

**Tabs:**
1. **Write-offs** — existing write-off table + create write-off flow (migrated from old page).
2. **Stocktake** — existing stocktake UI (migrated from Analytics page if present, otherwise new).

**Visible to:** `club_admin`, `asset_manager`.

---

## 6. Updated Existing Pages {#updated-pages}

### 6.1 Inventory Page (`/dashboard/inventory`, was `/dashboard/assets`)

**List view** (unchanged aggregation): asset type name, total qty, available qty, on-loan qty.

**Individual Items Drawer (new):**
- Triggered by clicking a row in the asset type table.
- Right-side `Drawer` component (width ~600px).
- Header: asset type name + "X items".
- Table inside drawer:
  - Columns: serial number (or "—"), warehouse, status (badge), notes, actions.
  - Status badges: available (green), on_loan (blue), maintenance (orange), retired (grey), written_off (red).
- **Actions per row** (admin/manager only):
  - Edit (warehouse, serial number, notes).
  - Retire item → confirms, calls `POST /api/v1/assets/items/:itemId/retire`.
  - Write off item → confirms, calls `POST /api/v1/assets/items/:itemId/write-off`.
- **Batch actions** (for items without serial numbers):
  - "Retire N items" / "Write off N items" — quantity input → calls type-level batch endpoints.

API: `GET /api/v1/assets/:typeId/items`.

### 6.2 Loans Page (`/dashboard/loans`)

**New: "Add from Kit" button** in the loan creation form/modal.

- Opens a Kit selector modal.
- Lists available kits (green badge) and unavailable kits (grey, with tooltip explaining which item is short).
- Selecting an available kit merges its items into the loan cart (quantities are additive if same type already in cart).
- Unavailable kits are non-selectable (disabled, not hidden).

All other loan flow behaviour is unchanged.

### 6.3 Reports Page (`/dashboard/reports`, was `/dashboard/analytics`)

Route rename and menu label change only. No functional changes to the page content.

Visible to: `club_admin`, `asset_manager`, `accountant` (was previously `club_admin` + `asset_manager` only — accountant now gains read access).

---

## 7. Sidebar Navigation {#sidebar}

Grouped structure with three labelled sections. Items are filtered per role at render time.

```
Overview                              (all roles with activeClub)

── EQUIPMENT ──────────────────────
  Warehouse                           (admin, manager)
  Asset Name                          (admin, manager)
  Inventory                           (all)
  Kits                                (admin, manager)

── OPERATIONS ─────────────────────
  Loans                               (all)
  Stock Management                    (admin, manager)
  Reports                             (admin, manager, accountant)

── MANAGEMENT ─────────────────────
  Users                               (admin)
  Teams                               (admin)
  Audit Logs                          (admin)
  Settings                            (admin)
```

When `activeClub` is null, all sections are hidden — sidebar shows Overview only.

Implementation: replace the flat `NAV_ITEMS` array in `DashboardLayout` with a grouped structure:

```typescript
const NAV_GROUPS = [
  {
    items: [{ key: '/dashboard', icon: ..., label: 'Overview' }],
  },
  {
    label: 'Equipment',
    items: [
      { key: '/dashboard/warehouses', ..., roles: ['club_admin', 'asset_manager'] },
      { key: '/dashboard/asset-names', ..., roles: ['club_admin', 'asset_manager'] },
      { key: '/dashboard/inventory', ..., roles: null }, // all
      { key: '/dashboard/kits', ..., roles: ['club_admin', 'asset_manager'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: '/dashboard/loans', ..., roles: null },
      { key: '/dashboard/stock', ..., roles: ['club_admin', 'asset_manager'] },
      { key: '/dashboard/reports', ..., roles: ['club_admin', 'asset_manager', 'accountant'] },
    ],
  },
  {
    label: 'Management',
    items: [
      { key: '/dashboard/users', ..., roles: ['club_admin'] },
      { key: '/dashboard/teams', ..., roles: ['club_admin'] },
      { key: '/dashboard/audit-logs', ..., roles: ['club_admin'] },
      { key: '/dashboard/settings', ..., roles: ['club_admin'] },
    ],
  },
];
```

Section headers (`EQUIPMENT`, `OPERATIONS`, `MANAGEMENT`) are rendered as non-clickable `Menu.ItemGroup` labels or custom divider elements.

---

## 8. Admin Area Changes {#admin}

The `/admin/*` area uses its own `AdminAuthContext` and is unaffected by the club user auth changes. Two additions only:

### 8.1 Sport Types Settings (new page)

Route: `/admin/settings/sport-types`

- Table: name, active toggle, sort order, edit/delete.
- Add / Edit via inline row edit or modal.
- Delete is soft (sets `is_active = false`). If clubs reference this sport type, backend returns 409 — show error message.
- Accessible from admin sidebar under a new "Settings" menu item.

API: `GET/POST/PUT/DELETE /api/v1/admin/settings/sport-types`.

### 8.2 Admin Audit Logs (new page)

Route: `/admin/audit-logs`

- Same layout as club-level audit logs page, but includes a `club_id` filter (select from club list).
- API: `GET /api/v1/admin/audit-logs`.

### 8.3 Admin Router / Sidebar

Add to `AdminLayout` sidebar:
- "Audit Logs" → `/admin/audit-logs`
- "Settings" → `/admin/settings/sport-types`

---

## 9. API Layer Changes {#api-layer}

Keep the existing flat file structure (`src/api/*.ts`). Changes per file:

| File | Changes |
|------|---------|
| `auth.ts` | Update `RegisterData` (remove club, add `first_name`/`last_name`). Add `selectClub(clubId)`, `registerClub(data)`, `getInvitations()`. |
| `client.ts` | Add `authClient` instance (uses unscoped token). Default `client` uses scoped token. |
| `users.ts` | Add `updateProfile(data)` using `authClient`. |
| `warehouses.ts` | New file: CRUD for warehouses. |
| `kits.ts` | New file: CRUD for kits + kit items. |
| `audit-logs.ts` | New file: `getClubAuditLogs(params)`. |
| `memberships.ts` | New file: `getMyClubs()`, `getInvitations()`, `acceptInvitation(clubId, invId)`, `declineInvitation(clubId, invId)`. |
| `assets.ts` | Add `getAssetItems(typeId)`, `retireItem(itemId)`, `writeOffItem(itemId)`, `retireByQuantity(typeId, qty)`, `writeOffByQuantity(typeId, qty)`. |
| `loans.ts` | No structural change — kit integration is UI-only (kit items are merged into `loan_items` before submit). |
| `admin.ts` | Add sport-type settings endpoints. Add admin audit-log endpoint. |

---

## 10. Route & Permission Matrix {#permissions}

| Route | No Club | coach | accountant | asset_manager | club_admin |
|-------|---------|-------|------------|---------------|------------|
| `/dashboard` (Overview) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/profile` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/clubs` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/create-club` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/warehouses` | — | — | — | ✓ | ✓ |
| `/dashboard/asset-names` | — | — | — | ✓ | ✓ |
| `/dashboard/inventory` | — | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/kits` | — | — | — | ✓ | ✓ |
| `/dashboard/loans` | — | ✓ | ✓ (read) | ✓ | ✓ |
| `/dashboard/stock` | — | — | — | ✓ | ✓ |
| `/dashboard/reports` | — | — | ✓ | ✓ | ✓ |
| `/dashboard/users` | — | — | — | — | ✓ |
| `/dashboard/teams` | — | — | — | — | ✓ |
| `/dashboard/audit-logs` | — | — | — | — | ✓ |
| `/dashboard/settings` | — | — | — | — | ✓ |
