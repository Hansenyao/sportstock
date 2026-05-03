# SportStock

A web-based asset management platform for small youth sports clubs. Clubs can track equipment (balls, jerseys, training gear), manage loan requests from coaches, monitor stock levels, and generate reports.

## Monorepo Structure

```
sportstock/
├── backend/    # Node.js / Express REST API (deployed on Vercel)
└── frontend/   # React + Ant Design web app (deployed on Vercel)
```

See each sub-project for setup and usage:

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Ant Design 6, React Router v7, Vite |
| Backend | Node.js 18, Express 4, TypeScript |
| Database | PostgreSQL 14+ (Azure) |
| Auth | Platform-owned — bcrypt + JWT + email OTP (Resend) |
| File Storage | Supabase Storage |
| Push Notifications | Firebase Cloud Messaging (Web Push) |
| Deployment | Vercel (frontend + backend as separate projects) |

## Key Features

- Multi-tenant: each club is an isolated tenant scoped by `club_id`
- Role-based access: `club_admin`, `asset_manager`, `coach`
- Full loan lifecycle: request → approve → check-out → return with condition tracking
- 4-bucket return: good / minor damage / write-off / lost quantities per item
- Inventory audit trail via append-only stock movements
- Straight-line depreciation and financial reporting
