# Settings Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Club Profile" to "Settings" (admin-only nav), split the page into two self-contained section components with independent edit states, and fix the missing `low_stock_threshold` field in the Analytics Alert Thresholds edit form.

**Architecture:** The old monolithic `pages/ClubProfile/index.tsx` (one shared `editing` state for both sections) is replaced with `pages/Settings/index.tsx` (thin layout wrapper) + two self-contained sub-components: `ClubInfoSection` and `AlertThresholdsSection`, each owning their own data-fetching and editing state. Nav item, route, and all cross-references are updated atomically in the final task.

**Tech Stack:** React 18, TypeScript, Ant Design 5, React Router v6, Axios (`api/clubs.ts`).

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/pages/Settings/sections/ClubInfoSection.tsx` |
| Create | `frontend/src/pages/Settings/sections/AlertThresholdsSection.tsx` |
| Create | `frontend/src/pages/Settings/index.tsx` |
| Modify | `frontend/src/layouts/DashboardLayout.tsx` |
| Modify | `frontend/src/router/index.tsx` |
| Modify | `frontend/src/pages/Analytics/tabs/AlertsTab.tsx` |
| Delete | `frontend/src/pages/ClubProfile/index.tsx` |

---

### Task 1: Create `ClubInfoSection`

**Files:**
- Create: `frontend/src/pages/Settings/sections/ClubInfoSection.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend/src/pages/Settings/sections
```

Write `frontend/src/pages/Settings/sections/ClubInfoSection.tsx` with this exact content:

```tsx
import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Form, Input, Select, Button, Flex, Spin, App,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../../api/clubs';

const SPORT_TYPES = [
  'Football', 'Basketball', 'Swimming', 'Tennis', 'Volleyball',
  'Baseball', 'Rugby', 'Hockey', 'Athletics', 'Other',
];

export default function ClubInfoSection() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyClub()
      .then(c => setClub(c))
      .catch(() => message.error('Failed to load club info'))
      .finally(() => setLoading(false));
  }, [message]);

  function startEdit() {
    if (!club) return;
    form.setFieldsValue({
      name:          club.name,
      sport_type:    club.sport_type,
      contact_email: club.contact_email,
      address:       club.address ?? '',
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function handleSave(values: {
    name: string;
    sport_type: string;
    contact_email: string;
    address?: string;
  }) {
    setSaving(true);
    try {
      const res = await updateMyClub(values);
      setClub(res.data);
      setEditing(false);
      message.success('Club profile updated');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save changes';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card style={{ borderRadius: 12, border: 'none', marginBottom: 24 }}>
        <Flex justify="center"><Spin /></Flex>
      </Card>
    );
  }

  return (
    <Card
      title="Club Profile"
      style={{ borderRadius: 12, border: 'none', marginBottom: 24 }}
      extra={isAdmin && !editing && (
        <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
      )}
    >
      {editing ? (
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="name" label="Club Name"
            rules={[{ required: true, message: 'Club name is required' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="sport_type" label="Sport Type"
            rules={[{ required: true, message: 'Sport type is required' }]}
          >
            <Select options={SPORT_TYPES.map(s => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item
            name="contact_email" label="Contact Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input placeholder="City, Country" />
          </Form.Item>
          <Flex gap={8}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Save Changes
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
          </Flex>
        </Form>
      ) : (
        <Descriptions column={1} size="middle" bordered={false}>
          <Descriptions.Item label="Club Name">{club?.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Sport Type">{club?.sport_type ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Contact Email">{club?.contact_email ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Address">{club?.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="Member Since">
            {club?.created_at ? new Date(club.created_at).toLocaleDateString() : '—'}
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors referencing `ClubInfoSection.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings/sections/ClubInfoSection.tsx
git commit -m "feat(settings): add self-contained ClubInfoSection component"
```

---

### Task 2: Create `AlertThresholdsSection`

**Files:**
- Create: `frontend/src/pages/Settings/sections/AlertThresholdsSection.tsx`

- [ ] **Step 1: Write the file**

Write `frontend/src/pages/Settings/sections/AlertThresholdsSection.tsx` with this exact content:

```tsx
import { useEffect, useState } from 'react';
import {
  Card, Descriptions, Radio, InputNumber, Button, Flex, Spin, App, Typography,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getMyClub, updateMyClub, type Club } from '../../../api/clubs';

const { Text } = Typography;

export default function AlertThresholdsSection() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const isAdmin = user?.role === 'club_admin';

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [alertMode, setAlertMode]           = useState<'months' | 'percent'>('percent');
  const [alertValue, setAlertValue]         = useState<number>(80);
  const [lowStockThreshold, setLowStock]    = useState<number>(2);

  useEffect(() => {
    getMyClub()
      .then(c => {
        setClub(c);
        setAlertMode(c.retirement_alert_mode   ?? 'percent');
        setAlertValue(c.retirement_alert_value ?? 80);
        setLowStock(c.low_stock_threshold      ?? 2);
      })
      .catch(() => message.error('Failed to load alert thresholds'))
      .finally(() => setLoading(false));
  }, [message]);

  function startEdit() {
    if (!club) return;
    setAlertMode(club.retirement_alert_mode   ?? 'percent');
    setAlertValue(club.retirement_alert_value ?? 80);
    setLowStock(club.low_stock_threshold      ?? 2);
    setEditing(true);
  }

  function cancelEdit() {
    if (club) {
      setAlertMode(club.retirement_alert_mode   ?? 'percent');
      setAlertValue(club.retirement_alert_value ?? 80);
      setLowStock(club.low_stock_threshold      ?? 2);
    }
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateMyClub({
        retirement_alert_mode:  alertMode,
        retirement_alert_value: alertValue,
        low_stock_threshold:    lowStockThreshold,
      });
      setClub(res.data);
      setAlertMode(res.data.retirement_alert_mode   ?? 'percent');
      setAlertValue(res.data.retirement_alert_value ?? 80);
      setLowStock(res.data.low_stock_threshold      ?? 2);
      setEditing(false);
      message.success('Alert thresholds updated');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save changes';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card title="Analytics Alert Thresholds" style={{ borderRadius: 12, border: 'none' }}>
        <Flex justify="center"><Spin /></Flex>
      </Card>
    );
  }

  const alertModeLabel = alertMode === 'percent' ? 'Life elapsed (%)' : 'Remaining life (months)';
  const alertSummary =
    alertMode === 'percent'
      ? `Alert when ≥ ${alertValue}% of useful life has elapsed`
      : `Alert when ≤ ${alertValue} months of useful life remain`;

  return (
    <Card
      title="Analytics Alert Thresholds"
      style={{ borderRadius: 12, border: 'none' }}
      extra={isAdmin && !editing && (
        <Button icon={<EditOutlined />} onClick={startEdit}>Edit</Button>
      )}
    >
      {editing ? (
        <div>
          <Text style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>
            Retirement Alert Trigger
          </Text>
          <Radio.Group
            value={alertMode}
            onChange={e => setAlertMode(e.target.value as 'months' | 'percent')}
            style={{ marginBottom: 16 }}
          >
            <Radio value="percent">Life elapsed (%)</Radio>
            <Radio value="months">Remaining life (months)</Radio>
          </Radio.Group>

          <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
            <Text>
              {alertMode === 'percent' ? 'Alert when life elapsed ≥' : 'Alert when remaining months ≤'}
            </Text>
            <InputNumber
              min={1}
              max={alertMode === 'percent' ? 100 : 120}
              value={alertValue}
              onChange={v => setAlertValue(v !== null ? v : alertValue)}
              addonAfter={alertMode === 'percent' ? '%' : 'months'}
              style={{ width: 160 }}
            />
          </Flex>

          <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
            <Text>Low Stock Default</Text>
            <InputNumber
              min={1}
              value={lowStockThreshold}
              onChange={v => setLowStock(v !== null ? v : lowStockThreshold)}
              addonAfter="units"
              style={{ width: 160 }}
            />
          </Flex>

          <Flex gap={8}>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              Save Changes
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
          </Flex>
        </div>
      ) : (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Retirement Alert Mode">{alertModeLabel}</Descriptions.Item>
          <Descriptions.Item label="Threshold">{alertSummary}</Descriptions.Item>
          <Descriptions.Item label="Low Stock Default">
            {club?.low_stock_threshold ?? 2} units
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors referencing `AlertThresholdsSection.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings/sections/AlertThresholdsSection.tsx
git commit -m "feat(settings): add AlertThresholdsSection with low_stock_threshold edit fix"
```

---

### Task 3: Create `Settings/index.tsx` page container

**Files:**
- Create: `frontend/src/pages/Settings/index.tsx`

- [ ] **Step 1: Write the file**

Write `frontend/src/pages/Settings/index.tsx`:

```tsx
import { Typography } from 'antd';
import ClubInfoSection from './sections/ClubInfoSection';
import AlertThresholdsSection from './sections/AlertThresholdsSection';

const { Title } = Typography;

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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings/index.tsx
git commit -m "feat(settings): add Settings page container"
```

---

### Task 4: Update routing, nav, and cross-references

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/layouts/DashboardLayout.tsx`
- Modify: `frontend/src/pages/Analytics/tabs/AlertsTab.tsx`

- [ ] **Step 1: Update `router/index.tsx`**

Current lines 8 and 42:
```typescript
import ClubProfilePage from '../pages/ClubProfile';
// ...
<Route path="/dashboard/club"        element={<ClubProfilePage />} />
```

Replace line 8:
```typescript
import SettingsPage from '../pages/Settings';
```

Replace line 42:
```typescript
          <Route path="/dashboard/settings"    element={<SettingsPage />} />
```

- [ ] **Step 2: Update `DashboardLayout.tsx`**

Current import block (line 3):
```typescript
import {
  DashboardOutlined, DatabaseOutlined, SwapOutlined,
  TeamOutlined, BankOutlined, LogoutOutlined, MenuOutlined,
  AppstoreOutlined, DeleteOutlined, TrophyOutlined, TagOutlined, BarChartOutlined,
} from '@ant-design/icons';
```

Replace `BankOutlined` with `SettingOutlined`:
```typescript
import {
  DashboardOutlined, DatabaseOutlined, SwapOutlined,
  TeamOutlined, SettingOutlined, LogoutOutlined, MenuOutlined,
  AppstoreOutlined, DeleteOutlined, TrophyOutlined, TagOutlined, BarChartOutlined,
} from '@ant-design/icons';
```

Current nav item (line 31):
```typescript
  { key: '/dashboard/club',        icon: <BankOutlined />,         label: 'Club Profile' },
```

Replace with:
```typescript
  { key: '/dashboard/settings',    icon: <SettingOutlined />,      label: 'Settings',    adminOnly: true },
```

- [ ] **Step 3: Update `AlertsTab.tsx` — two navigate calls**

Current line 148:
```typescript
          <Link onClick={() => navigate('/dashboard/club')}>
```

Replace with:
```typescript
          <Link onClick={() => navigate('/dashboard/settings')}>
```

Current line 176:
```typescript
          <Link onClick={() => navigate('/dashboard/club')}>
```

Replace with:
```typescript
          <Link onClick={() => navigate('/dashboard/settings')}>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. (The old `ClubProfile/index.tsx` file still exists at this point, which is fine — it will be removed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.tsx \
        frontend/src/layouts/DashboardLayout.tsx \
        frontend/src/pages/Analytics/tabs/AlertsTab.tsx
git commit -m "feat(settings): update route to /dashboard/settings, rename nav item, restrict to admin"
```

---

### Task 5: Delete old ClubProfile page and final verification

**Files:**
- Delete: `frontend/src/pages/ClubProfile/index.tsx`

- [ ] **Step 1: Delete the old file**

```bash
rm /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend/src/pages/ClubProfile/index.tsx
rmdir /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend/src/pages/ClubProfile 2>/dev/null || true
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors. If there are errors referencing `ClubProfile`, they point to an import that was missed in Task 4 — fix them now.

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/pages/ClubProfile
git commit -m "refactor(settings): remove old ClubProfile page"
```

---

## Manual Verification Checklist

After all tasks complete, start the dev server and verify in the browser:

```bash
cd /home/yyf/Desktop/Projects/ai-coder/sportstock/frontend
npm run dev
```

1. **As `club_admin`:** "Settings" nav item is visible; clicking it opens `/dashboard/settings` with page title "Settings"
2. **As `asset_manager` or `coach`:** "Settings" nav item is NOT visible in the sidebar
3. **Settings page:** Two sections — "Club Profile" (card with title) and "Analytics Alert Thresholds" (card with title) — both visible
4. **Club Profile section:** Edit button appears for admin. Clicking Edit opens the form. Save/Cancel work correctly. Saving one section does NOT affect the other section's state.
5. **Alert Thresholds section:** Edit button appears for admin. Edit form now includes a "Low Stock Default" `InputNumber` field (previously missing). Save updates the value correctly.
6. **Analytics → Alerts tab:** "Edit in Settings" links in both Retirement Risk card and Low Stock card navigate to `/dashboard/settings`
7. **Direct URL `/dashboard/club`:** Falls through to the catch-all `<Navigate to="/" />` route — that's expected (old URL no longer valid)
