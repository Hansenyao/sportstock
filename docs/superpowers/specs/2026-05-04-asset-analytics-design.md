# Asset Analytics Feature — Design Spec

**Date:** 2026-05-04  
**Status:** Approved  
**Scope:** Frontend analytics dashboard + supporting backend enhancements

---

## 1. Overview

Add a dedicated **Analytics** page to the SportStock web app, accessible to `club_admin` and `asset_manager` roles. The page provides four tabs of operational intelligence: asset status overview, retirement/procurement alerts, loan trends, and stock movement history.

No native app — the same responsive page serves PC, tablet, and phone. Tabs replace a single long scroll to keep each section legible on small screens.

---

## 2. Navigation & Access

- Add **Analytics** as a new sidebar nav item between Write-offs and Users.
- Route: `/analytics`
- Role gate: `club_admin` and `asset_manager` only. `coach` and `super_admin` cannot access this page.
- Frontend router file: `frontend/src/router/index.tsx`
- Sidebar config file: `frontend/src/layouts/DashboardLayout.tsx`

---

## 3. Page Structure

```
Analytics
├── Tab 1: Overview
├── Tab 2: Alerts          ← badge showing total alert count
├── Tab 3: Loan Analysis
└── Tab 4: Stock Movements
```

Chart library: **Recharts** (new dependency). Chosen for React-native API, full TypeScript support, lightweight bundle (~620 KB), and compatibility with Ant Design. All charts use `<ResponsiveContainer>` for mobile adaptability.

---

## 4. Tab Specifications

### 4.1 Overview Tab

**Section A — Asset Status** (row of 5 cards)

| Card | Value | Source |
|------|-------|--------|
| Active Total | available + on_loan + maintenance | enhanced `/reports/summary` |
| Available | available_quantity sum | enhanced `/reports/summary` |
| On Loan | checked_out loan item count | enhanced `/reports/summary` |
| In Maintenance | maintenance batch count | enhanced `/reports/summary` |
| Retired | retired batch total_quantity | enhanced `/reports/summary` |

Note: "Active Total" excludes retired assets. The existing `/reports/summary` does not filter retired batches — the backend query must be updated (see Section 6.1).

**Section B — Financial Summary** (row of 3 cards)

| Card | Value | Source |
|------|-------|--------|
| Original Value | sum of (purchase_price × total_quantity) for all active batches | enhanced `/reports/summary` |
| Current Net Value | sum of net_book_value across active batches | `/reports/depreciation` |
| Depreciation Rate | (original − net) / original × 100% | derived client-side |

The Depreciation Rate card includes a thin progress bar.

**Section C — Charts** (2-column grid, collapses to 1 column on mobile)

- **Asset Distribution by Category** — Recharts `PieChart`, one slice per asset type category, legend inline.
- **Available Quantity by Category** — Recharts `BarChart`, one bar per category, colour-coded.

Data for both charts comes from the enhanced `/reports/summary` which must include a per-category breakdown.

---

### 4.2 Alerts Tab

Tab label shows a red badge with the total count of active alerts (retirement risk + low stock combined).

**Section A — Retirement Risk**

Displays all active asset batches that meet the club's configured retirement alert threshold — either remaining life ≤ N months (`months` mode) or elapsed life ≥ X% (`percent` mode), per Club Settings.

Table columns: Asset name / Batch / Purchase Date / Useful Life / Life Used (progress bar + %) / Status badge

Status badge logic:
- **Critical** (red): life used ≥ 90%
- **Warning** (orange): life used ≥ threshold but < 90%

Assets without `purchase_date` or `useful_life_years` are excluded.

Inline link: "⚙ Threshold: [current value] · Edit in Settings" — navigates to Club Profile settings section.

**Section B — Low Stock — Procurement Needed**

Displays all asset types where `available_quantity ≤ effective_threshold`.

Effective threshold = `COALESCE(asset_types.low_stock_threshold, clubs.low_stock_threshold)` — this logic already exists in the DB trigger `fn_check_low_stock`.

Table columns: Asset Type / Total Qty / Available / Threshold / Status badge

Status badge logic:
- **Out of Stock** (red): available = 0
- **Low Stock** (orange): available > 0 but ≤ threshold

Inline link: "⚙ Club default threshold: [value] · Edit in Settings".

---

### 4.3 Loan Analysis Tab

Three sections, all data from `GET /reports/loan-usage`:

**Monthly Trend** — Recharts `LineChart` with area fill, past 6 months, one data point per month showing total loan count.

**Top Borrowed Assets** — ranked list of top 10 assets by loan count, each with an inline relative bar.

**Loan Activity by Coach** — table listing each coach's total loan count and total units borrowed.

---

### 4.4 Stock Movements Tab

Data from `GET /reports/movements` (existing) plus a new lightweight endpoint.

**Summary Cards** (4 cards): transaction counts for Purchase / Loan Out / Loan Return / Write-off.

**Units Moved by Type** — Recharts horizontal `BarChart`, one bar per movement type, showing absolute unit volume.

**Recent Movements** (new endpoint `GET /reports/movements/recent`) — table of the latest 10 stock_movement records for the club: Asset / Type badge / Δ Qty / Date. Full audit trail remains in the existing Inventory module.

---

## 5. Club Settings — Alert Thresholds

A new **Analytics Alert Thresholds** section is appended to the existing Club Profile page (`frontend/src/pages/ClubProfile/index.tsx`). Visible and editable by `club_admin` only.

### 5.1 Retirement Alert

Two mutually exclusive modes (radio selection):

| Mode | Stored as | Trigger condition |
|------|-----------|-------------------|
| `months` | `retirement_alert_value` = N | `(useful_life_years * 12) - months_elapsed ≤ N` |
| `percent` | `retirement_alert_value` = X | `months_elapsed / (useful_life_years * 12) ≥ X / 100` |

Default on club creation: `mode = 'percent'`, `value = 80`.

### 5.2 Low Stock Alert

The existing `clubs.low_stock_threshold` column (default 2) is already present. The settings section exposes it for editing. No schema change needed for this field.

---

## 6. Backend Changes

### 6.1 Enhance `GET /reports/summary`

Add to the existing query:
- Per-status asset batch counts: available / on_loan / maintenance / retired (filter `status != 'retired'` for active total)
- Per-category breakdown: `{ category_name, total_qty, available_qty }[]`
- Keep existing fields for backward compatibility

### 6.2 New endpoint `GET /reports/alerts`

New dedicated endpoint (does not modify the existing `/reports/depreciation` endpoint) that:
- Accepts the club's `retirement_alert_mode` and `retirement_alert_value` from the clubs table
- Returns retirement-risk batches filtered by threshold
- Returns low-stock asset types using `COALESCE(at.low_stock_threshold, c.low_stock_threshold)`
- Returns total alert count

### 6.3 New endpoint `GET /reports/movements/recent`

Returns the 10 most recent `stock_movements` rows for the club:

```
{ id, asset_type_name, type, quantity_delta, created_at }[]
```

No pagination needed — this is a summary widget only.

### 6.4 DB Migration — `clubs` table

Add two columns:

```sql
ALTER TABLE clubs
  ADD COLUMN retirement_alert_mode  VARCHAR(10) NOT NULL DEFAULT 'percent'
    CHECK (retirement_alert_mode IN ('months', 'percent')),
  ADD COLUMN retirement_alert_value INT         NOT NULL DEFAULT 80;
```

### 6.5 Club settings API

- `GET /clubs/:id/settings` — returns alert threshold config (extend existing club endpoint or add sub-route)
- `PATCH /clubs/:id/settings` — updates `retirement_alert_mode`, `retirement_alert_value`, `low_stock_threshold`. Role: `club_admin` only.

---

## 7. Frontend Files

| File | Change |
|------|--------|
| `frontend/src/pages/Analytics/index.tsx` | New page — 4-tab Analytics dashboard |
| `frontend/src/pages/Analytics/tabs/OverviewTab.tsx` | Overview tab component |
| `frontend/src/pages/Analytics/tabs/AlertsTab.tsx` | Alerts tab component |
| `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx` | Loan analysis tab component |
| `frontend/src/pages/Analytics/tabs/StockMovementsTab.tsx` | Stock movements tab component |
| `frontend/src/api/reports.ts` | New API client for all `/reports/*` endpoints |
| `frontend/src/layouts/DashboardLayout.tsx` | Add Analytics nav item (admin + manager only) |
| `frontend/src/router/index.tsx` | Add `/analytics` route with role guard |
| `frontend/src/pages/ClubProfile/index.tsx` | Append Analytics Alert Thresholds settings section |
| `frontend/package.json` | Add `recharts` dependency |

---

## 8. Data Flow

```
Analytics page load
  ├── GET /reports/summary          → Overview status cards + category charts
  ├── GET /reports/depreciation     → Financial summary (net value, depreciation rate)
  ├── GET /reports/alerts           → Alerts tab (retirement risk + low stock)
  ├── GET /reports/loan-usage       → Loan Analysis tab
  ├── GET /reports/movements        → Stock Movements summary cards + bar chart
  └── GET /reports/movements/recent → Stock Movements recent table

All requests are parallel (Promise.all per tab on mount).
Club alert threshold config is fetched once on page load via GET /clubs/:id/settings and passed down to the Alerts tab.
```

---

## 9. Responsive Behaviour

| Viewport | Layout adjustment |
|----------|-------------------|
| Mobile (< 576px) | 2×2 card grid for status row; single-column charts; tables with `scroll.x` |
| Tablet (576–992px) | 4-column status cards; 2-column chart grid |
| Desktop (> 992px) | Full layout as shown in mockups |

Ant Design `Grid` breakpoints (`xs`, `sm`, `md`) control all column counts.

---

## 10. Open Items

- **`super_admin` access**: Super admins manage all clubs but the current JWT club_id scoping would return data for only one club. Cross-club analytics is out of scope for this feature.
- **Date range filter**: No date range selector in this phase. The 6-month window for loan trends is fixed. Can be added as a Phase 2 enhancement.
- **Export**: PDF/Excel export is a Phase 2 item per the original roadmap.
