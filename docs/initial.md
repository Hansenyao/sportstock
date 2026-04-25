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
| Auth | Clerk (embedded components + JWT verification) |
| File storage | Supabase |
| Push | Firebase Cloud Messaging (Web Push) |
| Deployment | PostgreSQL on Azure; backend + frontend on Vercel (separate projects) |

## Updated on 2026-04-24

### 用户注册/登录功能设计更新如下：

#### 总体要求

- 不使用Clerk,而是由平台完全实现注册/登录/重设密码等用户体系功能
- 用户注册时，使用用户的email作为账号、密码设置不小于6个字符
- 用户注册时，需要通过email发送verify code来验证email的有效性 （暂定使用resend）
- 用户忘记密码时，采用email verify code的方式验证用户身份、然后提供reset password的操作

#### 用户注册

- 只提供一个“注册俱乐部”的功能，面向public。注册是需要提供俱乐部信息和个人信息。 注册俱乐部的同时、自动注册该用户为该俱乐部的Admin
- 注册俱乐部时，需要考虑该俱乐部在平台中的唯一性;
- 一个俱乐部的其他用户（asset manager/coach）的账号，只能由该俱乐部的Admin登录后在后台创建
- 平台管理员无需注册。默认提供一个super admin, 后续的super admin账号同样由那个默认的账号创建

#### 用户登录

- 均采用email作为账号登录