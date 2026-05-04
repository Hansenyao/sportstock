# Settings Page Redesign — Design Spec

**Date:** 2026-05-04
**Scope:** Rename "Club Profile" to "Settings", restrict nav to admin-only, split the page into two self-contained section components, and fix the missing `low_stock_threshold` field in the edit form.

---

## Context

The current `pages/ClubProfile/index.tsx` page has two Card sections rendered in one component with a single shared `editing` boolean state. Problems:

1. Nav item "Club Profile" is visible to all roles, but the Edit button is already admin-only — the nav visibility is inconsistent with the edit restriction.
2. The section name "Club Profile" is used for both the nav item and the overall page, which is confusing as more settings are added over time.
3. `low_stock_threshold` is displayed in the Analytics Alert Thresholds view mode but is absent from the edit form — users cannot update this value.
4. The single shared `editing` state means both sections enter edit mode together, preventing independent editing.

---

## Approach: Extract Sections into Self-Contained Components

Each section becomes its own component managing its own `editing` state and API calls. The parent page is a thin layout wrapper. Future settings sections follow the same pattern — add a new file and drop it into the parent.

---

## Navigation & Routing

**`frontend/src/layouts/DashboardLayout.tsx`**

- Change nav item label: `"Club Profile"` → `"Settings"`
- Change nav item key/route: `/dashboard/club` → `/dashboard/settings`
- Change icon: `BankOutlined` → `SettingOutlined`
- Add `adminOnly: true` (currently has no role restriction)

**Route registration (`App.tsx` or equivalent router config)**

- Change route path: `/dashboard/club` → `/dashboard/settings`
- Change component import: `pages/ClubProfile` → `pages/Settings`

**`frontend/src/pages/Analytics/tabs/AlertsTab.tsx`**

- Update the "Edit in Settings" link target from `/dashboard/club` to `/dashboard/settings`.

---

## File Structure

```
frontend/src/pages/
  Settings/                          ← rename from ClubProfile/
    index.tsx                        ← page container: title + section layout only
    sections/
      ClubInfoSection.tsx            ← new: Club Profile basic info
      AlertThresholdsSection.tsx     ← new: Analytics Alert Thresholds
```

The old `pages/ClubProfile/` directory is deleted after the rename.

---

## Component Design

### `Settings/index.tsx`

Responsibilities:
- Render page title `"Settings"`
- Render `<ClubInfoSection />` and `<AlertThresholdsSection />` in vertical layout
- No state, no API calls, no editing logic

```tsx
export default function SettingsPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 20, marginTop: 0 }}>Settings</Title>
      <ClubInfoSection />
      <AlertThresholdsSection />
    </div>
  );
}
```

---

### `sections/ClubInfoSection.tsx`

**Self-contained.** Fetches its own club data, manages own `editing` state.

**View mode fields (Ant Design `Descriptions`):**
- Club Name
- Sport Type
- Contact Email
- Address
- Member Since (created_at, formatted as date)

**Edit mode fields (Ant Design `Form`):**
- Club Name — required
- Sport Type — required, `Select` dropdown
- Contact Email — required, email validation
- Address — optional

**Behavior:**
- Edit button visible only when `user.role === 'club_admin'`
- On save: `updateMyClub({ name, sport_type, contact_email, address })`
- Save failure: `message.error(...)`, stay in edit mode
- Save success: `message.success(...)`, exit edit mode, refresh local club state

---

### `sections/AlertThresholdsSection.tsx`

**Self-contained.** Fetches its own club data, manages own `editing` state.

**View mode fields (Ant Design `Descriptions`):**
- Retirement Alert Mode (`"Life elapsed (%)"` or `"Remaining life (months)"`)
- Threshold value (formatted with unit)
- Low Stock Default (`{low_stock_threshold ?? 2} units`)

**Edit mode fields (Ant Design `Form`):**
- Retirement Alert Trigger — `Radio.Group`, options: `"Life elapsed (%)"` / `"Remaining life (months)"`
- Threshold value — `InputNumber`, conditional validation (1–100 for %, 1–120 for months)
- Low Stock Default — `InputNumber`, min=1, label `"Low Stock Default (units)"` ← **bug fix: previously missing**

**Behavior:**
- Edit button visible only when `user.role === 'club_admin'`
- Form initial values: `{ retirement_alert_mode, retirement_alert_value, low_stock_threshold: low_stock_threshold ?? 2 }`
- On save: `updateMyClub({ retirement_alert_mode, retirement_alert_value, low_stock_threshold })`
- Save failure: `message.error(...)`, stay in edit mode
- Save success: `message.success(...)`, exit edit mode, refresh local club state

---

## Edge Cases

- Both sections may be in edit mode simultaneously — each is fully independent.
- If `getMyClub()` fails in either section, that section shows an inline error; the other section is unaffected.
- Coach and asset_manager roles no longer see the "Settings" nav item. If they navigate directly to `/dashboard/settings` via URL, the page still renders (read-only, no Edit button visible) — no hard redirect needed since there is no sensitive data on this page.

---

## Out of Scope

- Adding new settings sections beyond the two existing ones.
- Role-based redirect on direct URL access to `/dashboard/settings`.
