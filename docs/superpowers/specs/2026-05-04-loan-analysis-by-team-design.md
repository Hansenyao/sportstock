# Loan Analysis by Team — Design Spec

**Date:** 2026-05-04
**Scope:** Add a Team filter to the existing Loan Analysis tab in Analytics. Filtering by team re-fetches all charts and tables server-side. When a team is selected, a Team Summary block appears above the existing content.

---

## Context

The Loan Analysis tab (`Analytics/tabs/LoanAnalysisTab.tsx`) currently shows:
- Monthly Loan Trend (area chart, past 6 months)
- Top Borrowed Assets (ranked bar progress)
- Loan Activity by Coach (table)

All data is fetched once by the parent `Analytics/index.tsx` and passed down as `loanUsage` props. The `loans` table already has a `team_id` FK column, so no schema changes are needed.

---

## Approach: Self-Contained Tab (chosen over lifting state to parent)

`LoanAnalysisTab` becomes fully self-contained: it owns its own state for `teamId`, `teams`, `loanUsage`, and `loading`. The parent `Analytics/index.tsx` removes the `getLoanUsage()` call and stops passing `loanUsage` as a prop. This keeps the parent clean and isolates all team-filter complexity inside the tab.

---

## Backend Changes

### `GET /api/v1/reports/loan-usage`

Add optional query parameter `team_id` (UUID). Existing behavior (no parameter = all teams) is unchanged.

```
GET /reports/loan-usage              → all teams (current behavior)
GET /reports/loan-usage?team_id=xxx  → scoped to that team
```

**`report.service.ts` — `getLoanUsage(clubId, { from_date?, to_date?, team_id? })`**

Each of the three parallel SQL queries gains one additional optional filter clause:

```sql
AND ($N::uuid IS NULL OR l.team_id = $N)
```

No new routes or controllers needed.

**New response field: `team_summary`**

When `team_id` is provided, the response includes a `team_summary` object. When not provided, `team_summary` is `null`.

```typescript
interface TeamSummary {
  id: string;
  name: string;
  age_group: string;
  gender: string;
  total_loans: number;
  active_loans: number;   // status = 'checked_out'
  overdue_loans: number;  // status = 'checked_out' AND due_date < NOW()
}
```

`team_summary` is fetched with a single additional SQL query when `team_id` is present — joined from the `teams` table and aggregated from `loans`.

---

## Frontend Changes

### `frontend/src/api/reports.ts`

- `getLoanUsage(params?: { team_id?: string })` — add optional params argument, pass as query string
- Add `TeamSummary` interface
- Extend `LoanUsageReport` with `team_summary?: TeamSummary | null`

### `frontend/src/pages/Analytics/tabs/LoanAnalysisTab.tsx`

Remove the `loanUsage: LoanUsageReport` prop. The tab manages its own state:

```typescript
const [teams, setTeams] = useState<Team[]>([]);
const [teamId, setTeamId] = useState<string | undefined>(undefined);
const [loanUsage, setLoanUsage] = useState<LoanUsageReport | null>(null);
const [loading, setLoading] = useState(true);
```

**Mount:** fetch `getTeams()` and `getLoanUsage()` in parallel.

**On `teamId` change:** re-fetch `getLoanUsage({ team_id: teamId })`.

**Rendered layout (top to bottom):**

1. **Filter Bar** — `Select allowClear placeholder="All Teams"`, hidden if `teams.length === 0`. Options formatted as `"${t.name} (${t.age_group} ${t.gender})"`, matching the Loans page style.
2. **Team Summary Cards** — rendered only when `teamId` is set. Three `<Statistic>` cards in a `Row`: Total Loans, Active Loans, Overdue Loans.
3. **Monthly Loan Trend** — existing, data scoped to team when filtered.
4. **Top Borrowed Assets** — existing, data scoped to team when filtered.
5. **Loan Activity by Coach** — existing, shows only coaches in the selected team when filtered.

### `frontend/src/pages/Analytics/index.tsx`

- Remove `getLoanUsage()` from the `Promise.all` in the `load()` function.
- Remove `loanUsage` from the `PageData` interface.
- Remove `loanUsage` prop from `<LoanAnalysisTab />`.

---

## Interaction Behavior

| Action | Result |
|--------|--------|
| Tab initial load | `getTeams()` + `getLoanUsage()` run in parallel; tab shows its own spinner |
| Select a team | Re-fetch `getLoanUsage({ team_id })`; Team Summary Cards appear |
| Clear team (× or reset) | Re-fetch `getLoanUsage()` without `team_id`; Summary Cards disappear |
| Club has no teams | Select not rendered; tab behaves as before |

---

## Edge Cases

- **Team selected but zero loans:** charts/tables show existing empty states ("No loan data"); Summary Cards show all zeros. No error.
- **`getTeams()` request fails:** Select not rendered; loanUsage still displays. Silent degradation — does not affect other tabs.
- **`getLoanUsage()` request fails:** Tab shows `<Alert type="error">` inline. Other tabs are unaffected.

---

## Out of Scope

- Combining Team filter with date range filter (Loan Analysis has no date filter today)
- Multi-team comparison view
