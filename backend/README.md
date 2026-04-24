# SportStock — Backend API

REST API for the SportStock asset management platform. Built with Node.js, Express, TypeScript, and PostgreSQL.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | PostgreSQL (Azure) |
| Auth | Clerk (JWT verification via JWKS) |
| File Storage | Supabase Storage |
| Push Notifications | Firebase Cloud Messaging (Web Push) |
| Deployment | Vercel |

## Project Structure

```
src/
├── types/                  # Shared TypeScript types and Express augmentation
├── config/                 # Environment variable config
├── db/                     # PostgreSQL pool
├── utils/                  # AppError class
├── middleware/
│   ├── auth.ts             # Clerk JWT verification; auto-provisions user on first login
│   ├── requireRole.ts      # RBAC role guard
│   └── errorHandler.ts     # Unified error response format
├── services/               # Business logic (no HTTP knowledge)
│   ├── auth.service.ts
│   ├── club.service.ts
│   ├── user.service.ts
│   ├── asset.service.ts
│   ├── loan.service.ts
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
- A running PostgreSQL instance (see `db-init.sql`)
- Clerk, Supabase, and Firebase accounts

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Initialize the database
psql $DATABASE_URL -f db-init.sql

# 4. Start development server
npm run dev
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

## Testing

The test suite uses **Jest + Supertest** and runs against the real Azure PostgreSQL database. No local database setup is required.

### Test Structure

```
tests/
├── __mocks__/
│   ├── clerk-backend.ts     # Mocks Clerk JWT verification (no real token needed)
│   └── firebase-admin.ts    # Mocks FCM (prevents SDK init failure)
├── helpers/
│   └── index.ts             # DB fixtures and auth header builder
├── setup.ts                 # Loads .env before each suite
├── auth.test.ts             # GET /auth/me — token validation, auto-create flow
├── clubs.test.ts            # Club registration, profile, update
├── assets.test.ts           # Asset CRUD, categories, depreciation
├── loans.test.ts            # Full loan lifecycle + validation
├── inventory.test.ts        # Stock operations, stocktake sessions
├── reports.test.ts          # Summary, depreciation, loan-usage, movements
└── notifications.test.ts    # Inbox, mark-read, FCM token registration
```

**59 tests across 7 suites (~30s)**

### How It Works

- **Auth mock** — Token format `test|{clerkId}` is parsed by the Clerk mock to extract the user identity. No real Clerk tokens needed.
- **Real database** — Each test suite creates isolated data under a unique prefix (e.g. `t_loans_*`) in `beforeAll` and deletes it in `afterAll` via `DELETE FROM clubs CASCADE`.
- **Firebase mock** — `firebase-admin` is replaced so FCM push calls are no-ops.

### Running Tests

```bash
# Run all tests
npm test

# Run a single file
npm test -- tests/loans.test.ts

# Watch mode (re-runs on file changes)
npm run test:watch
```

## Environment Variables

See `.env.example` for all required variables. Key groups:

| Group | Variables |
|---|---|
| Server | `PORT`, `NODE_ENV` |
| Database | `DATABASE_URL` |
| Clerk | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |

## API Reference

Base path: `/api/v1`

All endpoints require a Clerk-issued JWT as `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| GET | `/auth/me` | Get current user profile (auto-creates on first login) |

### Clubs

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/clubs` | Any | Register a new club (caller becomes club_admin) |
| GET | `/clubs/me` | Any | Get own club profile |
| PUT | `/clubs/me` | club_admin | Update club info |
| PUT | `/clubs/me/logo` | club_admin | Upload club logo |

### Users

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/users` | Any | List club members |
| GET | `/users/invites` | club_admin | List pending invites |
| POST | `/users/invite` | club_admin | Invite member by email |
| GET | `/users/:id` | Any | Get member detail |
| PUT | `/users/:id` | club_admin | Update name / phone / role |
| DELETE | `/users/:id` | club_admin | Deactivate member |

### Assets

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assets/categories` | Any | List categories (system + club) |
| POST | `/assets/categories` | admin / manager | Create custom category |
| POST | `/assets/bulk-import` | admin / manager | Import assets from CSV |
| GET | `/assets` | Any | List assets (filter: category, status, search) |
| POST | `/assets` | admin / manager | Create asset |
| GET | `/assets/:id` | Any | Asset detail + recent loan history |
| PUT | `/assets/:id` | admin / manager | Update asset |
| DELETE | `/assets/:id` | admin / manager | Soft-delete asset |
| PUT | `/assets/:id/image` | admin / manager | Upload asset image |
| GET | `/assets/:id/depreciation` | admin / manager | Straight-line depreciation info |

### Loans

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/loans` | Any | List loans (coaches see own only) |
| POST | `/loans` | coach | Submit loan request |
| GET | `/loans/:id` | Any | Loan detail |
| POST | `/loans/:id/approve` | admin / manager | Approve pending request |
| POST | `/loans/:id/reject` | admin / manager | Reject pending request |
| POST | `/loans/:id/checkout` | admin / manager | Confirm item pick-up |
| POST | `/loans/:id/initiate-return` | coach | Signal intent to return |
| POST | `/loans/:id/return` | admin / manager | Confirm return + record condition |

### Inventory

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/inventory/movements` | admin / manager | Stock movement history |
| POST | `/inventory/purchase` | admin / manager | Record new stock purchase |
| POST | `/inventory/adjust` | admin / manager | Manual quantity adjustment |
| POST | `/inventory/retire` | admin / manager | Write off / retire units |
| POST | `/inventory/maintenance/complete` | admin / manager | Complete repair, restore qty |
| GET | `/inventory/stocktake` | admin / manager | List stocktake sessions |
| POST | `/inventory/stocktake` | admin / manager | Start new stocktake |
| GET | `/inventory/stocktake/:id` | admin / manager | Get session + item counts |
| PUT | `/inventory/stocktake/:id` | admin / manager | Record counts / complete session |

### Reports

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/summary` | admin / manager | Asset counts and total value |
| GET | `/reports/depreciation` | admin / manager | Net book value for all assets |
| GET | `/reports/loan-usage` | admin / manager | Top assets, per-coach summary, monthly trend |
| GET | `/reports/movements` | admin / manager | Stock movement totals by type |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List current user's notifications |
| PUT | `/notifications/read-all` | Mark all notifications as read |
| PUT | `/notifications/:id/read` | Mark one notification as read |
| POST | `/notifications/fcm-token` | Register device push token |
| DELETE | `/notifications/fcm-token` | Unregister device push token |

## Error Format

All errors follow a consistent structure:

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
| `asset_manager` | Asset CRUD, loan processing, inventory, reports |
| `coach` | Browse assets, submit / return loans |
| `super_admin` | Platform-wide access (no club scope) |

## Authentication Flow

1. Frontend embeds Clerk `<SignIn />` — Clerk issues a signed JWT
2. Every API request sends `Authorization: Bearer <token>`
3. `auth` middleware verifies the JWT via Clerk's JWKS endpoint
4. On first login the user profile is auto-created; pending invites are consumed automatically
5. `club_id` and `role` are injected into `req.user` — never trusted from the request body

## Database

Run `db-init.sql` against a PostgreSQL 14+ instance to create all tables, indexes, stored procedures, and triggers. The script is idempotent — safe to re-run.

Key stored procedures called by the API:

| Procedure | Used by |
|---|---|
| `approve_loan(loan_id, approver_id)` | `POST /loans/:id/approve` |
| `reject_loan(loan_id, approver_id, reason)` | `POST /loans/:id/reject` |
| `checkout_loan(loan_id, operator_id)` | `POST /loans/:id/checkout` |
| `return_loan(loan_id, operator_id, condition, notes)` | `POST /loans/:id/return` |
| `purchase_stock(asset_id, operator_id, qty, notes)` | `POST /inventory/purchase` |
| `retire_asset(asset_id, operator_id, qty, notes)` | `POST /inventory/retire` |
| `complete_maintenance(asset_id, operator_id, qty, notes)` | `POST /inventory/maintenance/complete` |
