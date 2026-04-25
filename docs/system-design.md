# SportStock — System Design

> Document Version: v2.0
> Updated: 2026-04-24

---

## 1. System Overview

SportStock is a **multi-tenant SaaS platform** that digitalizes asset management for small youth sports clubs. It consists of a responsive web application and a backend API:

- **Web Application** — a single responsive web app serving all user roles (Club Admin, Asset Manager, Coach). The fluid layout adapts to PC, Pad, and Phone (iOS/Android browsers). No separate native mobile app.
- **Backend API** — RESTful service that enforces multi-tenant isolation and serves the web application

Each club is an independent **tenant**. Data is fully isolated — no club can access another's records.

Authentication is **platform-owned**: users register with email + password, login returns a signed JWT. Email verification and password reset use OTP codes delivered via **Resend**. No external auth provider is used.

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Clients
        WEB[Web Application<br/>React + Ant Design<br/>Responsive — PC / Pad / Phone]
    end

    subgraph Backend["Backend (Vercel)"]
        API[REST API Server<br/>Node.js / ExpressJS]
        AUTH[Auth Middleware<br/>JWT Verification]
        NOTIF[Notification Service<br/>FCM Web Push]
        JOBS[Background Jobs<br/>Depreciation / Overdue alerts]
    end

    subgraph Storage
        DB[(PostgreSQL<br/>Azure)]
        FILES[Supabase Storage]
    end

    subgraph Email
        RESEND[Resend<br/>Email Service]
    end

    WEB -->|HTTPS / REST| API
    API --> AUTH
    AUTH -->|Verify JWT| API
    API --> DB
    API --> FILES
    API --> NOTIF
    API --> RESEND
    JOBS --> DB
    JOBS --> NOTIF

    NOTIF -->|Web Push / Email| WEB
```

---

## 3. Multi-Tenant Data Model

Each resource is scoped to a `club_id`, ensuring complete isolation between tenants.

```mermaid
erDiagram
    EMAIL_VERIFICATIONS {
        uuid id PK
        string email
        string code "6-digit OTP"
        string type "registration | password_reset"
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }

    CLUB {
        uuid id PK
        string name
        string sport_type
        string address
        string contact_email
        timestamp created_at
    }

    USER {
        uuid id PK
        uuid club_id FK
        string email UK
        string password_hash "bcrypt hash"
        string name
        string phone
        enum role "club_admin | asset_manager | coach"
        boolean email_verified
        boolean is_active
    }

    ASSET {
        uuid id PK
        uuid club_id FK
        string name
        string category
        int total_quantity
        int available_quantity
        enum status "available | on_loan | maintenance | retired"
        string brand
        string model
        date purchase_date
        decimal purchase_price
        int useful_life_years
        string image_url
        string notes
    }

    LOAN {
        uuid id PK
        uuid club_id FK
        uuid asset_id FK
        uuid coach_id FK
        uuid approved_by FK
        int quantity
        string reason
        enum status "pending | approved | rejected | checked_out | returned"
        date due_date
        timestamp checked_out_at
        timestamp returned_at
        enum return_condition "good | minor_damage | severe_damage"
    }

    STOCK_MOVEMENT {
        uuid id PK
        uuid club_id FK
        uuid asset_id FK
        uuid operator_id FK
        enum type "purchase | loan_out | loan_return | write_off | adjustment"
        int quantity_delta
        string notes
        timestamp created_at
    }

    CLUB ||--o{ USER : has
    CLUB ||--o{ ASSET : owns
    CLUB ||--o{ LOAN : manages
    ASSET ||--o{ LOAN : referenced_in
    ASSET ||--o{ STOCK_MOVEMENT : tracks
    USER ||--o{ LOAN : requests
```

---

## 4. Core Flow Charts

### 4.1 User Authentication Flow

Authentication is fully owned by the platform. No external auth provider.

```mermaid
flowchart TD
    subgraph Registration["Club Registration (Public)"]
        A([Club registers: POST /auth/register])
        B[Validate inputs\nCheck email + club name uniqueness]
        C[Create user + club atomically\nemail_verified = false]
        D[Send 6-digit OTP to email via Resend]
        E[POST /auth/verify-email with OTP]
        F[Mark email_verified = true]
    end

    subgraph Login
        G([POST /auth/login])
        H[Verify email + password\nbcrypt.compare]
        I{Email verified?}
        J[Return 403 — unverified]
        K[Sign JWT sub=userId\nReturn token + user profile]
    end

    subgraph Protected["Protected API Request"]
        L[Extract Bearer token]
        M[jwt.verify → userId]
        N[Load user from DB by userId]
        O([Route handler proceeds])
    end

    A --> B --> C --> D --> E --> F

    G --> H --> I
    I -- No --> J
    I -- Yes --> K

    K -->|Bearer token| L --> M --> N --> O
```

### 4.2 User Management Flow

```mermaid
flowchart TD
    A([Club Admin creates user\nPOST /api/v1/users])
    B[Validate email uniqueness]
    C[Generate random temp password]
    D[Hash password with bcrypt]
    E[Insert user with email_verified = true]
    F[Email temp password to new user via Resend]
    G([User logs in with temp password])
    H([User changes password via PUT /auth/password])

    A --> B --> C --> D --> E --> F --> G --> H
```

### 4.3 Password Reset Flow

```mermaid
flowchart TD
    A([POST /auth/forgot-password with email])
    B{Email exists and verified?}
    C[Silent response — never reveal existence]
    D[Insert 6-digit OTP in email_verifications]
    E[Send OTP email via Resend]
    F([POST /auth/reset-password with email + OTP + new_password])
    G[Validate OTP not expired and unused]
    H[Mark OTP as used]
    I[Hash + save new password]

    A --> B
    B -- No --> C
    B -- Yes --> D --> E --> F --> G --> H --> I
```

---

### 4.4 Loan Request & Approval Flow

```mermaid
flowchart TD
    A([Coach opens app]) --> B[Browse available assets]
    B --> C[Select asset + quantity]
    C --> D[Fill in reason & due date]
    D --> E[Submit loan request]
    E --> F[Loan saved as PENDING\nNotification sent to manager]

    F --> G{Manager reviews}
    G -- Reject --> H[Loan status → REJECTED\nCoach notified with reason]
    H --> Z([End])

    G -- Approve --> I[Loan status → APPROVED\nCoach notified]
    I --> J[Coach picks up items\nManager confirms check-out]
    J --> K[Loan status → CHECKED_OUT\nAvailable qty decreases]

    K --> L{Due date approaching?}
    L -- 1 day before --> M[Push reminder to coach]
    M --> L
    L -- Overdue --> N[Alert coach + manager]

    K --> O[Coach initiates return via app]
    O --> P[Manager confirms receipt & records condition]

    P --> Q{Item condition?}
    Q -- Good --> R[Loan status → RETURNED\nAvailable qty restored]
    Q -- Minor damage --> R
    Q -- Severe damage --> S[Asset status → UNDER MAINTENANCE\nQty stays unavailable]

    R --> Z2([Loan cycle complete])
    S --> T[Manager schedules repair]
    T --> U{Repaired?}
    U -- Yes --> V[Asset status → AVAILABLE\nQty restored]
    U -- No --> W[Asset status → RETIRED\nWrite off stock]
    V --> Z2
    W --> Z2
```

---

### 4.5 Asset Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Available : Purchase / receive stock

    Available --> OnLoan : Loan approved & checked out
    OnLoan --> Available : Returned in good or minor damage condition
    OnLoan --> UnderMaintenance : Returned severely damaged

    Available --> UnderMaintenance : Manually flagged for repair
    UnderMaintenance --> Available : Repair completed

    Available --> Retired : Decommissioned by manager
    UnderMaintenance --> Retired : Beyond repair

    Retired --> [*]
```

---

### 4.6 Depreciation Calculation (Straight-Line Method)

```mermaid
flowchart TD
    A[Asset recorded with:\nPurchase Price P\nUseful Life Y years\nPurchase Date] --> B[Annual Depreciation = P ÷ Y]
    B --> C{Current date vs purchase date}
    C --> D[Years Elapsed = N]
    D --> E[Accumulated Depreciation = Annual × N]
    E --> F{Accumulated ≥ P?}
    F -- Yes --> G[Net Book Value = 0\nAsset fully depreciated]
    F -- No --> H[Net Book Value = P − Accumulated]
    G --> I([Report shown to Club Admin])
    H --> I
```

---

## 5. API Design Principles

- **RESTful** — standard HTTP verbs (GET, POST, PUT, PATCH, DELETE)
- **Multi-tenant scoping** — all protected endpoints implicitly scoped to the authenticated user's `club_id`
- **JWT auth** — Bearer token required on all protected routes; issued by `POST /auth/login`
- **Versioning** — URL-based versioning (`/api/v1/...`)
- **Pagination** — all list endpoints support `page` + `limit` query params
- **Consistent error format**:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "due_date must be a future date"
  }
  ```

### Key API Resource Groups

| Resource | Base Path | Auth | Notes |
|----------|-----------|------|-------|
| Auth (public) | `/api/v1/auth` | None | `POST /register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` |
| Auth (protected) | `/api/v1/auth` | JWT | `GET /me`, `PUT /password` |
| Clubs | `/api/v1/clubs` | JWT | `GET /me`, `PUT /me`, `PUT /me/logo` |
| Users | `/api/v1/users` | JWT | CRUD; `POST /` (admin only — creates user directly) |
| Assets | `/api/v1/assets` | JWT | CRUD, categories, depreciation |
| Loans | `/api/v1/loans` | JWT | Request, approve/reject, check-out, return |
| Inventory | `/api/v1/inventory` | JWT | Stock movements, stocktake |
| Reports | `/api/v1/reports` | JWT | Financial summary, depreciation, usage stats |
| Notifications | `/api/v1/notifications` | JWT | List, mark as read, FCM tokens |

---

## 6. Security Considerations

| Concern | Approach |
|---------|---------|
| Authentication | Platform-owned JWT auth; `POST /auth/login` issues signed JWT |
| Password storage | bcrypt (10 rounds) — passwords never stored in plaintext |
| Email verification | 6-digit OTP via Resend, 15-minute expiry, single-use |
| Authorization | RBAC enforced server-side using `role` from user profile |
| Tenant isolation | `club_id` loaded from DB via JWT sub (userId) — never trusted from request body |
| Transport security | HTTPS enforced on all endpoints |
| Sensitive operations | Audit log records who did what and when |

---

## 7. Default Super Admin

A default platform super admin is created by running the seed script after initializing the schema:

```bash
npm run seed:admin
```

Default credentials: `admin@sportstock.com` / `Admin@SportStock2024`
**Change the password immediately after first login.**

---

*This document will be updated as architecture decisions are confirmed and implementation progresses.*
