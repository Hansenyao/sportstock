# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**SportStock** is a multi-tenant SaaS platform for asset management targeting small youth sports clubs. Clubs own equipment (balls, jerseys, training gear) but manage it informally. SportStock digitizes this through a web dashboard and mobile app.

**Current state:** Requirements and architecture are fully documented. No implementation code exists yet. Tech stack decisions are partially confirmed — verify with user before starting implementation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js (ExpressJS) — deployed on Vercel |
| Database | PostgreSQL (hosted on Azure) |
| Web frontend | React + Ant Design (responsive — PC / Pad / Phone) — deployed on Vercel |
| Auth | Platform-owned — email + bcrypt password, JWT issued on login; OTP email verification via Resend |
| File storage | Supabase |
| Push notifications | Firebase Cloud Messaging (Web Push) |
| Deployment | PostgreSQL on Azure; backend + frontend as separate Vercel projects |

No separate native mobile app. The single responsive web application covers PC, Pad, and Phone via fluid layout.

Open decisions: Redis hosting provider, offline caching strategy, business/pricing model, data privacy requirements for youth member data.

---

## Architecture

One responsive web application talks to one backend API:

```
Web Application (React + Ant Design, responsive)
  └─→ REST API (Node.js/ExpressJS, Vercel) ─→ PostgreSQL (Azure)
                                            ─→ Supabase Storage (files)
                                            ─→ FCM Web Push (notifications)
```

Backend and frontend are **separate Vercel projects** with independent deployment pipelines.

**Multi-tenancy:** Every resource is scoped to `club_id`. The `club_id` is injected from JWT claims on the server — never trusted from the request body. No cross-club data access is possible.

**Background jobs** (Redis-queued): straight-line depreciation calculations, overdue loan alerts, low-stock notifications.

---

## Data Model

Core entities (all scoped to `club_id`):

- **CLUB** — tenant root; one club = one tenant
- **USER** — `email` (unique, login identifier), `password_hash` (bcrypt), `email_verified` flag; roles: `club_admin`, `asset_manager`, `coach`, `super_admin`
- **ASSET** — equipment with status: `available | on_loan | maintenance | retired`; tracks `total_quantity` and `available_quantity`
- **LOAN** — borrow/return transaction with status: `pending | approved | rejected | checked_out | returned`
- **STOCK_MOVEMENT** — append-only audit trail for every inventory change (purchase, loan_out, loan_return, write_off, adjustment)

Depreciation uses straight-line method: `Annual = purchase_price / useful_life_years`, `Net Book Value = purchase_price − (Annual × years_elapsed)`.

---

## Key Flows

**Loan cycle:** Coach submits request (PENDING) → Manager approves/rejects → Coach picks up, Manager confirms check-out (CHECKED_OUT, qty decremented) → Coach initiates return, Manager confirms condition → RETURNED (qty restored) or UNDER MAINTENANCE if severely damaged.

**Asset lifecycle:** Available → OnLoan → Available (good return) or UnderMaintenance (damaged) → Available (repaired) or Retired (beyond repair).

**Auth:** Platform-owned. `POST /api/v1/auth/register` (public) registers a club + admin user and sends an email OTP (Resend) for verification. `POST /api/v1/auth/login` returns a signed JWT. Backend middleware verifies the JWT (jsonwebtoken), loads user by UUID from DB, and injects `club_id` and `role` into request context. Passwords stored as bcrypt hashes. Password reset via email OTP. Other users (asset_manager/coach) created directly by club admin via `POST /api/v1/users`.

---

## API Design

- Base path: `/api/v1/`
- All list endpoints support `page` + `limit` query params
- Consistent error response: `{ statusCode, error, message }`
- Resource groups: `/auth`, `/clubs`, `/users`, `/assets`, `/loans`, `/inventory`, `/reports`, `/notifications`

---

## User Roles & Permissions

| Role | Can Do |
|------|--------|
| `club_admin` | Register club, invite members, assign roles, approve loans |
| `asset_manager` | CRUD assets, process check-out/return, run stocktakes |
| `coach` | Browse assets, submit loan requests, confirm returns |
| `super_admin` | Platform operator — manages all clubs across tenants |

---

## Delivery Phases

| Phase | Scope |
|-------|-------|
| **MVP (Phase 1)** | Club registration, asset CRUD, loan request/approval/return, real-time inventory, push notifications, loan history |
| **Phase 2** | Depreciation & financial reports, QR code scanning, bulk CSV/Excel import, stocktake, data export |
| **Phase 3** | Multi-language, advanced analytics, third-party integrations |

---

## Conventions

- **All code, documents, and comments must be written in English.** (Conversations with the user may be in Chinese, but all file content is English.)
- Prefer editing existing files over creating new ones.

---

## Key Documents

| Document | Path |
|----------|------|
| Project summary & tech stack | `docs/initial.md` |
| Full requirements (roles, features, flows) | `docs/requirements-analysis.md` |
| System design (architecture, data model, API, security) | `docs/system-design.md` |
| Session context & open decisions | `claude/context.md` |
