# SportStock — System Design

> Document Version: v1.0
> Created: 2026-04-04

---

## 1. System Overview

SportStock is a **multi-tenant SaaS platform** that digitalizes asset management for small youth sports clubs. It consists of a responsive web application and a backend API:

- **Web Application** — a single responsive web app serving all user roles (Club Admin, Asset Manager, Coach). The fluid layout adapts to PC, Pad, and Phone (iOS/Android browsers). No separate native mobile app.
- **Backend API** — RESTful service that enforces multi-tenant isolation and serves the web application

Each club is an independent **tenant**. Data is fully isolated — no club can access another's records.

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Clients
        WEB[Web Application<br/>React + Ant Design<br/>Responsive — PC / Pad / Phone]
    end

    subgraph Backend["Backend (Vercel)"]
        API[REST API Server<br/>Node.js / ExpressJS]
        AUTH[Auth Service<br/>JWT]
        NOTIF[Notification Service<br/>FCM Web Push]
        JOBS[Background Jobs<br/>Depreciation / Overdue alerts]
    end

    subgraph Storage
        DB[(PostgreSQL<br/>Azure)]
        FILES[Supabase Storage]
    end

    WEB -->|HTTPS / REST| API
    API --> AUTH
    API --> DB
    API --> FILES
    API --> NOTIF
    JOBS --> DB
    JOBS --> NOTIF

    NOTIF -->|Web Push / Email| WEB
```

---

## 3. Multi-Tenant Data Model

Each resource is scoped to a `club_id`, ensuring complete isolation between tenants.

```mermaid
erDiagram
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
        string name
        string email
        string password_hash
        enum role "club_admin | asset_manager | coach"
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
        enum status "pending | approved | rejected | returned"
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

```mermaid
flowchart TD
    A([User opens App / Web]) --> B[Enter email + password]
    B --> C{Credentials valid?}
    C -- No --> D[Return 401 error]
    D --> B
    C -- Yes --> E[Generate JWT\naccess token + refresh token]
    E --> F[Return tokens to client]
    F --> G[Client stores tokens]
    G --> H([Access protected resources])

    H --> I{Access token expired?}
    I -- No --> H
    I -- Yes --> J[Send refresh token]
    J --> K{Refresh token valid?}
    K -- Yes --> E
    K -- No --> L([Force re-login])
```

---

### 4.2 Loan Request & Approval Flow

```mermaid
flowchart TD
    A([Coach opens app]) --> B[Browse available assets]
    B --> C[Select asset + quantity]
    C --> D[Fill in reason\n& due date]
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
    O --> P[Manager confirms receipt\n& records condition]

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

### 4.3 Asset Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Available : Purchase / receive stock

    Available --> OnLoan : Loan approved\n& checked out
    OnLoan --> Available : Returned in good\nor minor damage condition
    OnLoan --> UnderMaintenance : Returned severely damaged

    Available --> UnderMaintenance : Manually flagged\nfor repair
    UnderMaintenance --> Available : Repair completed

    Available --> Retired : Decommissioned\nby manager
    UnderMaintenance --> Retired : Beyond repair

    Retired --> [*]
```

---

### 4.4 Inventory Stock Movement

```mermaid
flowchart LR
    subgraph Inbound
        A[Purchase / Receive]
        B[Return from loan\nin good condition]
        C[Repair completed]
    end

    subgraph Stock[Available Inventory]
        D((Available\nQty))
    end

    subgraph Outbound
        E[Loan checked out]
        F[Written off / Retired]
        G[Sent for repair]
    end

    A -->|+qty| D
    B -->|+qty| D
    C -->|+qty| D
    D -->|-qty| E
    D -->|-qty| F
    D -->|-qty| G
```

---

### 4.5 Depreciation Calculation (Straight-Line Method)

```mermaid
flowchart TD
    A[Asset recorded with:\nPurchase Price P\nUseful Life Y years\nPurchase Date] --> B[Annual Depreciation\n= P ÷ Y]
    B --> C{Current date vs\npurchase date}
    C --> D[Years Elapsed = N]
    D --> E[Accumulated Depreciation\n= Annual Depreciation × N]
    E --> F{Accumulated ≥ P?}
    F -- Yes --> G[Net Book Value = 0\nAsset fully depreciated]
    F -- No --> H[Net Book Value\n= P − Accumulated Depreciation]
    G --> I([Report shown to Club Admin])
    H --> I
```

---

## 5. API Design Principles

- **RESTful** — standard HTTP verbs (GET, POST, PUT, PATCH, DELETE)
- **Multi-tenant scoping** — all endpoints implicitly scoped to the authenticated user's `club_id`; no cross-club access possible
- **JWT auth** — Bearer token required on all protected routes
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

| Resource | Base Path | Notes |
|----------|-----------|-------|
| Auth | `/api/v1/auth` | Login, refresh token, logout |
| Clubs | `/api/v1/clubs` | Registration, profile |
| Users | `/api/v1/users` | Invite, role assignment, deactivate |
| Assets | `/api/v1/assets` | CRUD, bulk import, status update |
| Loans | `/api/v1/loans` | Request, approve/reject, check-out, return |
| Inventory | `/api/v1/inventory` | Stock movements, stocktake |
| Reports | `/api/v1/reports` | Financial summary, depreciation, usage stats |
| Notifications | `/api/v1/notifications` | List, mark as read |

---

## 6. Security Considerations

| Concern | Approach |
|---------|---------|
| Authentication | JWT (short-lived access token + refresh token rotation) |
| Authorization | Role-based access control (RBAC) enforced server-side |
| Tenant isolation | `club_id` injected from JWT claims — never trusted from request body |
| Transport security | HTTPS enforced on all endpoints |
| Sensitive operations | Audit log records who did what and when |
| Password storage | Bcrypt hashing with sufficient cost factor |

---

*This document will be updated as architecture decisions are confirmed and implementation progresses.*
