# SportStock - Project Initial Description

## Summary

**SportStock** is a multi-tenant SaaS platform + web application for asset management, targeting small youth sports clubs (football, basketball, swimming, tennis, etc.).

The core problem: these clubs own lots of equipment (balls, jerseys, training gear, etc.) but manage it informally — coaches ask staff in person, staff write entries by hand. There is no visibility, no inventory tracking, no financial record.

The solution: a responsive web application where clubs register, managers log assets, and coaches request loans — accessible from PC, pad, and phone browsers with a fluid layout that adapts to all screen sizes.


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
## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js (ExpressJS) |
| Database | PostgreSQL (hosted on Azure) |
| Web frontend | React + Ant Design (responsive — PC / Pad / Phone) |
| File storage | Supabase |
| Push | Firebase Cloud Messaging (Web Push) |
| Deployment | PostgreSQL on Azure; backend + frontend on Vercel (separate projects) |
