# Admin Portal Design

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

A platform-level admin portal for SportStock super admins. Provides a separate login entry point, platform-wide analytics, and management operations across all clubs.

The portal lives in the same frontend app as the club-facing dashboard but is fully isolated by directory structure and auth context, enabling a clean split into a separate app in the future.

---

## Architecture

### Frontend

Same React app, separate route segment `/admin/*` with its own layout and auth context.

| Route | Page |
|-------|------|
| `/admin/login` | Admin-only login page (rejects non-`super_admin`) |
| `/admin/dashboard` | Platform stats overview |
| `/admin/analytics` | Platform-wide analytics (4 tabs) |
| `/admin/clubs` | Club list |
| `/admin/clubs/:id` | Club detail (4 tabs) |

**Isolation approach:** All admin code lives under `frontend/src/admin/`. The `AdminAuthContext` uses separate localStorage keys (`admin_token`, `admin_user`) so admin and club sessions are fully independent.

### Backend

New route group `/api/v1/admin/*` in the existing Express app. All routes protected by `authenticate + requireRole('super_admin')`. Existing club-facing endpoints are not modified.

New files:
- `backend/src/routes/admin.ts`
- `backend/src/controllers/admin.controller.ts`
- `backend/src/services/admin.service.ts`

### Database

No schema changes required. `super_admin` role already exists in the `UserRole` type. Default admin account is created via the existing `scripts/seed-admin.ts` script (`admin@sportstock.com`).

---

## Backend API

All endpoints require `Authorization: Bearer <token>` with a `super_admin` JWT.

### Platform Stats

```
GET /api/v1/admin/stats
```

Returns: total clubs, total users, total assets, active loans count, overdue loans count.

### Analytics

```
GET /api/v1/admin/analytics/overview    — global club/user/asset/loan aggregates
GET /api/v1/admin/analytics/loans       — cross-club loan trends, top borrowed categories
GET /api/v1/admin/analytics/assets      — cross-club asset distribution by status/category, total value
GET /api/v1/admin/analytics/growth      — club and user registration growth by month
```

All analytics endpoints are read-only.

### Club Management

```
GET    /api/v1/admin/clubs                          — paginated club list with quick stats
GET    /api/v1/admin/clubs/:id                      — club detail + club_admin account info + quick stats
PATCH  /api/v1/admin/clubs/:id/status               — body: { is_active: boolean }
POST   /api/v1/admin/clubs/:id/reset-admin-password — returns { temp_password: string }
```

`GET /admin/clubs/:id` response includes:
- Club fields: id, name, sport_type, contact_email, address, is_active, created_at
- `admin_account`: the club's `club_admin` user — id, name, email, is_active, email_verified
- `stats`: user_count, asset_count, active_loan_count, overdue_loan_count

### User Management (within a club)

```
GET    /api/v1/admin/clubs/:id/users                        — paginated, all roles
PATCH  /api/v1/admin/clubs/:id/users/:uid/status            — body: { is_active: boolean }
POST   /api/v1/admin/clubs/:id/users/:uid/reset-password    — returns { temp_password: string }
```

### Asset Management (within a club)

```
GET    /api/v1/admin/clubs/:id/assets                       — paginated asset list
PATCH  /api/v1/admin/clubs/:id/assets/:aid/status           — body: { status: 'retired' } (soft disable)
DELETE /api/v1/admin/clubs/:id/assets/:aid                  — hard delete (for prohibited items)
```

Hard delete removes the `asset_type` and its `asset_batches` (CASCADE). Associated `stock_movements` records are preserved but their `asset_batch_id` is set to NULL (ON DELETE SET NULL). Use with confirmation prompt in UI.

### Loan Records (within a club, read-only)

```
GET /api/v1/admin/clubs/:id/loans   — paginated, supports status filter
```

### Password Reset

When admin resets a password, the service generates a random 12-character temporary password, hashes and stores it, and returns the plaintext to the admin. The admin communicates it to the user out of band. This approach avoids dependency on Resend being fully wired up.

---

## Frontend Structure

```
frontend/src/
  admin/
    api/
      admin.ts                  — axios instance for /api/v1/admin/*
    contexts/
      AdminAuthContext.tsx      — auth state using admin_token / admin_user in localStorage
    layouts/
      AdminLayout.tsx           — sidebar: Dashboard · Analytics · Clubs
    pages/
      Login/
        index.tsx               — /admin/login
      Dashboard/
        index.tsx               — /admin/dashboard (stats cards + club list preview)
      Analytics/
        index.tsx               — /admin/analytics (tabs: Overview, Loan Analysis, Asset Analysis, Growth Trends)
      Clubs/
        index.tsx               — /admin/clubs (searchable, paginated table)
      ClubDetail/
        index.tsx               — /admin/clubs/:id
        tabs/
          OverviewTab.tsx       — Club Info + Admin Account + Quick Stats
          UsersTab.tsx          — user table with enable/disable and reset password actions
          AssetsTab.tsx         — asset table with retire and delete actions
          LoansTab.tsx          — read-only loan table
    router/
      index.tsx                 — admin routes + RequireAdminAuth guard
```

`AdminAuthContext` is provided only around the `/admin/*` route subtree in `App.tsx`, keeping it fully separated from the club-side `AuthContext`.

---

## UI / UX Notes

- **All UI text is English.**
- **Dark theme** for admin portal to visually distinguish it from the club dashboard.
- **Admin login page** (`/admin/login`): standard email + password form. On successful login, checks `user.role === 'super_admin'`; if not, displays "This portal is for platform administrators only" and clears the token.
- **`RequireAdminAuth` guard**: redirects to `/admin/login` if not authenticated or role is not `super_admin`.
- **Club Detail — Overview Tab** layout: three cards side by side — Club Info (with Disable Club button at bottom), Club Admin Account (with Reset Admin Password button at bottom), Quick Stats.
- **Disable Club confirmation**: modal confirm before executing. Disabling a club sets `clubs.is_active = false` and does not touch individual user records. The `login` endpoint must be updated to also check `clubs.is_active`; if false, return 403 "Club is disabled" for all users of that club.
- **Asset hard delete**: requires a confirmation modal with explicit warning ("This will permanently delete the asset and all its stock movement records.").

---

## Auth Flow

1. Super admin navigates to `/admin/login`.
2. Submits email + password → `POST /api/v1/auth/login` (shared endpoint).
3. If `user.role !== 'super_admin'`: display error, do not store token.
4. If success: store token as `admin_token`, user as `admin_user` in localStorage; redirect to `/admin/dashboard`.
5. All admin API calls use `admin_token` from `AdminAuthContext`.
6. On logout: clear `admin_token` and `admin_user`; redirect to `/admin/login`.

---

## Open Questions

- **Asset hard delete audit**: `stock_movements` records are preserved with `asset_batch_id = NULL`. Admins should be aware that reports referencing deleted assets will show them as unknown. Acceptable for policy-driven removals.
