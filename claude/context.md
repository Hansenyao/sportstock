# SportStock — Project Context

> This file is maintained by Claude to preserve project context across sessions.
> Last updated: 2026-04-04

---

## What This Project Is

**SportStock** is a multi-tenant SaaS platform + mobile app for asset management, targeting small youth sports clubs (football, basketball, swimming, tennis, etc.).

The core problem: these clubs own lots of equipment (balls, jerseys, training gear, etc.) but manage it informally — coaches ask staff in person, staff write entries by hand. There is no visibility, no inventory tracking, no financial record.

The solution: a digital platform where clubs register, managers log assets, and coaches request loans via mobile app.

---

## Key Documents

| Document | Path | Description |
|----------|------|-------------|
| Requirements Analysis | `docs/requirements-analysis.md` | Full requirements doc — roles, features, flows, tech stack |

---

## User Roles (summary)

| Role | Key Responsibilities |
|------|---------------------|
| Club Admin | Registers club, manages members, approves loans |
| Asset Manager | Adds/edits assets, processes check-out/in, runs stocktakes |
| Coach | Browses assets, submits loan requests, confirms returns |
| Super Admin | Platform operator — manages all clubs |

---

## Core Feature Modules

1. **Club Management** — Registration, member invite, role assignment
2. **Asset Management** — CRUD, categories, status tracking, depreciation
3. **Loan Management** — Request → Approve → Check-out → Return cycle
4. **Inventory** — Real-time stock, low-stock alerts, stocktake
5. **Financial Overview** — Asset value, straight-line depreciation, reports
6. **Notifications** — In-app push (primary), email (optional)
7. **Reports & Analytics** — Usage stats, loan history, depreciation export

---

## Delivery Phases

| Phase | Scope |
|-------|-------|
| **MVP (Phase 1)** | Club registration, asset CRUD, loan request/approval, return, real-time inventory, push notifications, loan history |
| **Phase 2** | Depreciation & financial reports, QR code scanning, bulk import, stocktake, data export |
| **Phase 3** | Multi-language, advanced analytics, third-party integrations |

---

## Suggested Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js (NestJS) or Go |
| Database | PostgreSQL + Redis |
| Web frontend | React + Ant Design |
| Mobile app | React Native or Flutter |
| File storage | AWS S3 or Alibaba Cloud OSS |
| Push | Firebase Cloud Messaging + APNs |
| Deployment | Docker + cloud (AWS or Alibaba Cloud) |

> Tech stack is not finalized — confirm with user before starting implementation.

---

## Conventions & Preferences

- **All documents must be written in English** (user explicitly set this)
- Project language in conversation may be Chinese, but all files/docs are English

---

## Open Questions & Decisions Pending

- [ ] Confirm final tech stack (backend language, mobile framework)
- [ ] Confirm deployment target (AWS vs Alibaba Cloud)
- [ ] Define business/pricing model (free tier vs paid tier scope)
- [ ] Decide whether to support offline mode in mobile app for poor-network venues
- [ ] Clarify data privacy requirements for handling youth member data

---

## Session Log

| Date | Summary |
|------|---------|
| 2026-04-04 | Project initiated. Completed requirements analysis (`docs/requirements-analysis.md`). No code written yet. |
