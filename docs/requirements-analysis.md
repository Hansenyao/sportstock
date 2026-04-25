# SportStock - Requirements Analysis
# Asset Management Platform for Small Youth Sports Clubs

> Document Version: v2.0
> Updated: 2026-04-25

---

## 1. Project Background

### 1.1 Target Users

Designed for **small youth sports clubs**, including:
- Youth training clubs for football, basketball, swimming, tennis, and other sports
- Typical scale: 10–200 members, 1–20 coaches, 1–5 staff members

### 1.2 Current State & Pain Points

| Pain Point | Description |
|------------|-------------|
| Inefficient borrow/return process | Coaches must find staff in person; records kept by hand |
| Lack of asset visibility | Coaches cannot check asset availability in advance |
| Unclear inventory | Staff cannot track real-time stock levels |
| No asset records | No way to summarize asset details, total value, or history |
| No depreciation tracking | No records of wear and tear; depreciation cannot be calculated |
| Hard to trace losses | Informal loan records make it difficult to track lost or damaged items |

### 1.3 Solution Overview

Build a **multi-tenant SaaS platform + mobile app** where each club registers independently, enabling digital asset management, online borrow/return requests, and inventory tracking.

---

## 2. User Roles

### 2.1 Role Definitions

| Role | Description | Typical Actions |
|------|-------------|-----------------|
| **Club Admin** | Club registrant with highest privileges | Register club, manage members, approve loans |
| **Asset Manager** | Staff responsible for day-to-day warehouse management | Add assets, process loans/returns, run stocktakes |
| **Coach** | End user who borrows assets | Browse assets, submit loan requests, confirm returns |
| **Super Admin** | Platform operator | Manage club accounts, view platform-wide data |

### 2.2 Permission Matrix

| Feature | Super Admin | Club Admin | Asset Manager | Coach |
|---------|:-----------:|:----------:|:-------------:|:-----:|
| Register / manage club | ✓ | ✓ (own club only) | - | - |
| Invite members | ✓ | ✓ | - | - |
| Add / edit assets | ✓ | ✓ | ✓ | - |
| View asset list | ✓ | ✓ | ✓ | ✓ |
| Submit loan request | - | ✓ (on behalf of coach) | ✓ (on behalf of coach) | ✓ |
| Approve loan request | - | ✓ | ✓ | - |
| Process check-out / check-in | - | ✓ | ✓ | - |
| Write-off management | ✓ | ✓ | ✓ | - |
| View reports & analytics | ✓ | ✓ | ✓ | - |
| Run stocktake | - | ✓ | ✓ | - |

---

## 3. Functional Requirements

### 3.1 Club Management

- **Club registration**: Name, sport type, address, contact info
- **Member management**: Club admin creates member accounts (asset_manager/coach) directly; system emails temporary password to new user; role assignment and deactivation
- **Club profile**: Edit basic info, upload logo

### 3.2 Asset Management

#### 3.2.1 Asset Entry

Required fields:
- Name, category, quantity, status

Optional fields:
- Model / specification
- Brand
- Purchase date
- Unit purchase price (original cost)
- Expected useful life (for depreciation)
- Asset photo (camera upload supported)
- Asset tag (optional admin-entered label, e.g. BALL-01, for physical identification)
- Notes

Supports **bulk import** via CSV/Excel.

#### 3.2.2 Asset Categories

Pre-built categories (clubs can add custom ones):
- Balls (football, basketball, tennis, etc.)
- Training equipment (cones, jump ropes, agility rings, etc.)
- Apparel & gear (jerseys, shoes, protective equipment, etc.)
- Facility equipment (goals, nets, timers, etc.)
- Office supplies

#### 3.2.3 Asset Status

| Status | Description |
|--------|-------------|
| Available | In stock and ready to borrow |
| On Loan | Currently checked out |
| Under Maintenance | Being repaired or damaged |
| Retired | Decommissioned, no longer in use |

#### 3.2.4 Asset Detail View

- Basic asset information
- Current status and quantity
- Borrow/return history
- Depreciation info (current book value)

### 3.3 Loan Management

#### 3.3.1 Loan Request — Cart-Based Multi-Asset Flow

- Browse available assets (search and filter by category)
- Add one or more assets to a cart; adjust quantities per item in the cart
- Remove items from the cart if needed before confirming
- Fill in due date and reason for borrowing
- Submit the cart as a single loan request; all items are grouped under one loan
- Managers / Club Admins can also create a loan request on behalf of a coach (select the borrower when submitting)

#### 3.3.2 Approval Workflow

```
Coach (or manager on behalf of coach) submits request
        ↓
Asset Manager / Club Admin reviews
        ↓
Approved → Process check-out → Asset status per item → "On Loan", available qty decreases
        ↓ (or)
Rejected → Coach notified with reason
```

#### 3.3.3 Return Workflow

- Coach physically brings items back to the warehouse (no app step required from the coach)
- Manager opens the loan and confirms return directly
- Per each loan item: manager sets the returned quantity and condition (Good / Minor Damage / Severe Damage) and optional notes
- If returned quantity < loaned quantity, the difference is written off automatically (a write-off order is created and asset total_quantity is decremented)
- Returned quantity is restored to available stock
- Return timestamp recorded — loan cycle closed

#### 3.3.4 Loan Records

- Full record: borrower, check-out time, return time, list of all items (name, quantity, returned quantity, condition), operator
- Loan list shows first asset + "N more" summary; tap/click a row to expand and see all items (name, qty, image, size, model, asset tag)
- Filterable by date, person, and asset category
- Exportable to Excel

#### 3.3.5 Overdue Reminders

- Push notification to coach 1 day before due date
- Notification to coach and asset manager when overdue

### 3.4 Inventory Management

- **Real-time inventory**: Automatically updated on every check-out/check-in
- **Low stock alerts**: Notify manager when available quantity falls below threshold
- **Stocktake**: Manager can conduct a physical count by category and reconcile against system records
- **Stock movements**: Log new purchases (in) and decommissioned items (out)

### 3.5 Write-off Management

Write-offs permanently reduce an asset's total quantity and track the reason and operator.

#### 3.5.1 Manual Write-off

- Club Admin or Asset Manager creates a write-off order by selecting an asset, entering the quantity to write off, and providing a reason
- Available quantity and total quantity are decremented immediately upon confirmation
- All manual write-offs record the operator's identity and a timestamp

#### 3.5.2 Return-Triggered Write-off

- Automatically created during loan return when the returned quantity for a loan item is less than the loaned quantity
- The shortfall (loaned qty − returned qty) is written off; a write-off order is auto-generated and linked to the originating loan item
- Asset total quantity is decremented by the write-off amount; the loan item's return condition is preserved

#### 3.5.3 Write-off Records

- Every write-off records: asset, quantity, reason, source (manual or loan_return), linked loan item (if applicable), operator (created_by), timestamp, and optional notes
- Visible in the Write-offs dashboard section (Club Admin and Asset Manager only)
- Coaches do not have access to write-off management

### 3.6 Financial Overview

- **Total asset value**: Aggregated from original purchase costs
- **Depreciation**: Straight-line method; system auto-calculates accumulated depreciation and net book value annually
- **Asset value report**: Per-item original cost, accumulated depreciation, current net value
- **Stocktake report**: Variance between physical count and system records

### 3.7 Notifications

| Trigger | Recipients |
|---------|-----------|
| Coach submits loan request | Asset Manager, Club Admin |
| Request approved / rejected | Coach |
| Loan due tomorrow | Coach |
| Loan overdue | Coach, Asset Manager |
| Stock below alert threshold | Asset Manager |

Delivery: Web push notification via browser (primary); in-app notification when user is active; optional email notification.

### 3.8 Reports & Analytics

- Most-borrowed assets ranking
- Per-coach loan summary
- Monthly / quarterly asset movement report
- Depreciation report (exportable to PDF / Excel)

---

## 4. Non-Functional Requirements

### 4.1 Platform Architecture

| Client | Purpose |
|--------|---------|
| Web Application (responsive) | Single responsive web app serving all user roles — fluid layout adapts to PC, Pad, and Phone (iOS/Android browsers) |
| Backend API | Unified data layer with multi-tenant isolation |

### 4.2 Multi-Tenancy

- Complete data isolation between clubs — no cross-club data access
- Club Admins can only manage their own club's data

### 4.3 Security

- All API communication over HTTPS
- Authentication: platform-owned system — email + bcrypt-hashed password; JWT issued on login
- Email verification required at registration (OTP via Resend)
- Password reset via email OTP (Resend)
- RBAC enforced server-side using `role` field from user profile
- Audit log for sensitive operations (asset deletion, permission changes)

### 4.4 Usability

- Loan request flow completable in 3 steps or fewer on mobile
- QR code / barcode scanning for quick asset identification
- Primary language: English (extendable to other languages in later phases)

### 4.5 Reliability

- Regular data backups; user-facing data export supported
- Target system availability: ≥ 99.5%

---

## 5. Business Process Flows

### 5.1 Loan Flow

```
Coach (App)                        Asset Manager / Club Admin
    │                                        │
    ├─ Browse asset list                     │
    ├─ Add assets to cart                    │
    ├─ Confirm cart + fill details           │
    ├─ Submit loan request ────────────────→ Receive notification
    │                                        ├─ Review request
    │ ←────────────── Approval notification ─┤
    ├─ Pick up items from warehouse          │
    ├─ Confirm receipt (check-out)           ├─ OR Manager confirms check-out
    │                                        │
    │  (In use)                              │
    │                                        │
    │  Coach brings items back               │
    │                                      ←─┤ Manager confirms return per item
    │                                        ├─ Record condition + returned qty
    │                                        ├─ Write off damaged/missing items
    │ ←────────────── Return confirmed ──────┤ → Stock restored / write-off applied
```

### 5.2 Asset Lifecycle

```
Purchased → Available → On Loan → Returned → Available
                                      ↓ (damaged)
                                Under Maintenance → Available (repaired)
                                      ↓ (beyond repair)
                                   Retired → Written off
```

---

## 6. Priority & Phased Delivery

### Phase 1 — MVP (Core Functionality)

| Feature | Priority |
|---------|:--------:|
| Club registration & member management | P0 |
| Asset entry & browsing | P0 |
| Loan request & approval | P0 |
| Return confirmation | P0 |
| Real-time inventory updates | P0 |
| Push notifications | P1 |
| Loan history records | P1 |

### Phase 2 — Enhanced Features

| Feature | Priority |
|---------|:--------:|
| Depreciation calculation & financial reports | P1 |
| QR code scanning | P1 |
| Bulk asset import | P2 |
| Stocktake module | P2 |
| Data export (Excel / PDF) | P2 |

### Phase 3 — Extended Features

| Feature | Priority |
|---------|:--------:|
| Multi-language support | P3 |
| Advanced analytics & dashboards | P3 |
| Third-party integrations (accounting software, etc.) | P3 |

---

## 7. Suggested Tech Stack

> Recommendations — adjust based on team familiarity.

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js (ExpressJS) |
| Database | PostgreSQL (hosted on Azure) |
| Web frontend | React + Ant Design (responsive — PC / Pad / Phone) |
| Auth | Platform-owned: email + password, JWT, email OTP via Resend |
| File storage | Supabase |
| Push notifications | Firebase Cloud Messaging (Web Push) |
| Deployment | PostgreSQL on Azure; backend + frontend on Vercel (separate projects) |

---

## 8. Key Assumptions & Risks

| Item | Notes |
|------|-------|
| Small club scale | Low concurrency — no need for complex distributed architecture initially |
| Coach tech literacy | App must be extremely simple to minimize onboarding friction |
| Network conditions | Training venues may have poor connectivity — app should cache key data offline |
| Business model | Suggested: free tier (basic features) + paid tier (reports, more accounts, etc.) |
| Data compliance | If youth member data is involved, ensure compliance with relevant privacy regulations |

---

*This is the initial version of the requirements analysis. It will be updated as the product evolves.*
