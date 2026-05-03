# SportStock — Backend API

REST API for the SportStock asset management platform. Built with Node.js, Express, TypeScript, and PostgreSQL.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | PostgreSQL 14+ (Azure) |
| Auth | Platform-owned — email + bcrypt, JWT (jsonwebtoken), OTP via Resend |
| File Storage | Supabase Storage |
| Push Notifications | Firebase Cloud Messaging (Web Push) |
| Deployment | Vercel |

## Project Structure

```
src/
├── types/                  # Shared TypeScript types and Express augmentation
├── config/                 # Environment variable config
├── db/                     # PostgreSQL pool (pg) with DATE type parser
├── utils/                  # AppError class
├── middleware/
│   ├── auth.ts             # JWT verification; injects club_id + role into req.user
│   ├── requireRole.ts      # RBAC role guard
│   └── errorHandler.ts     # Unified error response format
├── services/               # Business logic (no HTTP knowledge)
│   ├── auth.service.ts     # Register, login, OTP verify, password reset
│   ├── club.service.ts
│   ├── user.service.ts
│   ├── asset.service.ts
│   ├── loan.service.ts     # Full loan lifecycle + 4-bucket return
│   ├── write-off.service.ts # Manual write-off orders
│   ├── inventory.service.ts
│   ├── report.service.ts
│   ├── notification.service.ts
│   ├── storage.ts          # Supabase file upload adapter
│   └── fcm.ts              # Firebase Cloud Messaging adapter
├── controllers/            # Extract req params → call service → send res
├── routes/                 # Route mapping and middleware binding
├── app.ts                  # Express app setup
└── server.ts               # Entry point
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ instance
- Supabase and Firebase accounts
- Resend account (for email OTP)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Initialize the database
psql $DATABASE_URL -f db-init.sql

# 4. (Optional) Create default super admin
npx ts-node scripts/seed-admin.ts

# 5. Start development server
npm run dev:watch
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with `ts-node` (single run) |
| `npm run dev:watch` | Start with `nodemon` hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run full test suite |
| `npm run test:watch` | Run tests in watch mode |

## Environment Variables

| Group | Variables |
|---|---|
| Server | `PORT`, `NODE_ENV` |
| Database | `DATABASE_URL` |
| Auth | `JWT_SECRET` |
| Email OTP | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |

> **Dev shortcut**: `sendVerificationCode()` currently uses a hardcoded OTP `"123456"` and does not send real email. Revert the `// TODO: restore` comments in `auth.service.ts` before going to production.

## API Reference

Base path: `/api/v1`

All endpoints (except `/auth/register` and `/auth/login`) require `Authorization: Bearer <JWT>`.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register club + admin user; sends email OTP |
| POST | `/auth/verify-email` | Verify OTP to activate account |
| POST | `/auth/login` | Email + password login; returns JWT |
| POST | `/auth/forgot-password` | Send password-reset OTP |
| POST | `/auth/reset-password` | Reset password with OTP |
| GET | `/auth/me` | Get current user profile (also used for token validation) |

### Clubs

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/clubs/me` | Any | Get own club profile |
| PUT | `/clubs/me` | club_admin | Update club info |
| PUT | `/clubs/me/logo` | club_admin | Upload club logo |

### Users

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/users` | Any | List club members |
| POST | `/users` | club_admin | Create new member |
| GET | `/users/:id` | Any | Get member detail |
| PUT | `/users/:id` | club_admin | Update name / phone / role |
| DELETE | `/users/:id` | club_admin | Deactivate member |

### Assets

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assets/categories` | Any | List categories (system + club) |
| POST | `/assets/categories` | admin / manager | Create custom category |
| GET | `/assets` | Any | List assets (filter: category, status, search) |
| POST | `/assets` | admin / manager | Create asset |
| GET | `/assets/:id` | Any | Asset detail |
| PUT | `/assets/:id` | admin / manager | Update asset |
| DELETE | `/assets/:id` | admin / manager | Delete asset |
| PUT | `/assets/:id/image` | admin / manager | Upload asset image |

### Loans

One loan supports multiple asset items (cart pattern).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/loans` | Any | List loans (coaches see own only) |
| POST | `/loans` | Any | Submit loan request (coach = self; manager specifies coach_id) |
| GET | `/loans/:id` | Any | Loan detail with items |
| PATCH | `/loans/:id` | creator | Edit pending loan (items, due_date, reason) |
| DELETE | `/loans/:id` | creator | Delete pending loan |
| POST | `/loans/:id/approve` | admin / manager | Approve pending request |
| POST | `/loans/:id/reject` | admin / manager | Reject pending request |
| POST | `/loans/:id/checkout` | borrower only | Confirm item pick-up (coach_id must match) |
| POST | `/loans/:id/return` | admin / manager | Confirm return with 4-bucket condition breakdown |

**Return payload** (`POST /loans/:id/return`):
```json
{
  "items": [
    {
      "loan_item_id": "uuid",
      "good_quantity": 2,
      "minor_damage_quantity": 1,
      "write_off_quantity": 0,
      "lost_quantity": 1,
      "notes": "optional"
    }
  ],
  "notes": "optional overall note"
}
```
The four quantities must sum to the original `quantity` for each item. Write-offs and lost items each generate a `write_off_order` record automatically.

### Write-offs

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/write-offs` | admin / manager | List write-off orders |
| GET | `/write-offs/:id` | admin / manager | Get write-off detail |
| POST | `/write-offs` | admin / manager | Create manual write-off |

### Inventory

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/inventory/movements` | admin / manager | Stock movement history |
| POST | `/inventory/purchase` | admin / manager | Record new stock purchase |
| POST | `/inventory/adjust` | admin / manager | Manual quantity adjustment |
| POST | `/inventory/retire` | admin / manager | Write off / retire units |
| POST | `/inventory/maintenance/complete` | admin / manager | Complete repair, restore qty |

### Reports

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/summary` | admin / manager | Asset counts and total value |
| GET | `/reports/depreciation` | admin / manager | Net book value for all assets |
| GET | `/reports/loan-usage` | admin / manager | Top assets, per-coach summary |
| GET | `/reports/movements` | admin / manager | Stock movement totals by type |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List current user's notifications |
| PUT | `/notifications/read-all` | Mark all as read |
| PUT | `/notifications/:id/read` | Mark one as read |
| POST | `/notifications/fcm-token` | Register device push token |
| DELETE | `/notifications/fcm-token` | Unregister device push token |

## Error Format

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Asset not found"
}
```

## User Roles

| Role | Permissions |
|---|---|
| `club_admin` | Full access within own club |
| `asset_manager` | Asset CRUD, loan processing, inventory, reports, write-offs |
| `coach` | Browse assets, submit / return loans |
| `super_admin` | Platform-wide access (no club scope) |

## Authentication Flow

1. User registers via `POST /auth/register` — club + admin user created, OTP sent via Resend
2. User verifies email via `POST /auth/verify-email`
3. Login via `POST /auth/login` — returns a signed JWT
4. Every API request sends `Authorization: Bearer <token>`
5. `auth` middleware verifies the JWT with `jsonwebtoken`, loads user from DB, injects `club_id` and `role` into `req.user`
6. `club_id` is always sourced from JWT claims — never from the request body

## Database

Run `db-init.sql` against a PostgreSQL 14+ instance. The script is idempotent (safe to re-run) — it drops and recreates all tables, enums, stored procedures, triggers, and seed data.

> **Note**: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. If migrating incrementally, run enum changes separately with autocommit enabled.

Key stored procedures:

| Procedure | Used by |
|---|---|
| `approve_loan(loan_id, approver_id)` | `POST /loans/:id/approve` |
| `reject_loan(loan_id, approver_id, reason)` | `POST /loans/:id/reject` |
| `checkout_loan(loan_id, operator_id)` | `POST /loans/:id/checkout` |
| `purchase_stock(asset_id, operator_id, qty, notes)` | `POST /inventory/purchase` |
| `retire_asset(asset_id, operator_id, qty, notes)` | `POST /inventory/retire` |
| `complete_maintenance(asset_id, operator_id, qty, notes)` | `POST /inventory/maintenance/complete` |
