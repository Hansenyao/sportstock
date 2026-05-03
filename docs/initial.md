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

## Updated on 2026-05-02

### 调整club的组织结构、增加team

- 1. Club创建好后，Admin可以为该club创建多个team(属性: Name, gender (Boys, Girls, Mixed), Age (U4, U5 through U21, Adult). 
Head Coach, Assistant Coach, Team Manager)，Head Coach, Assistant Coach, 和Team Manager只是team的职务标记，在整个系统中仍是coach角色以及对应的系统权限。
- 2. 添加/编辑team的时候，可以选择已有的Coach关联（connect）到该team的某个职务
- 3. 一个Coach可以assign到多个team、担任不同的职务。一个team只能有一个Head Coach，但可以有多个Assistant Coach 或 Team Manager
- 4. 添加coach的逻辑保持不变，也就是一个coach添加到系统时，默认不担任任何team的职务（需用通过team management来关联），但是在查看user信息的时候，能显示每个coach在哪些team担任了哪些职务
- 5. Admin的Dashboard左侧上提供关于Teams的管理选项和页面
- 6. Admin和Asset Manager在Dashboard上查看loan的时候，可以通过team来filting


### 调整club的资产管理，Asset Name必须是Admin或者是Asset Manager预先创建好的名字

- 1. Club创建好后，Admin或者Asset Manager需要创建Asset名字清单，比如：足球、球服、训练路障、球框等等。每个俱乐部的Asset名单是不一样的
- 2. Asset Manager在添加Asset Item的时候，只能从已有的名字清单中选取Asset Name、不支持输入
- 3. 同名称、同品牌、同型号、同尺寸的Asset,数量需要汇总，但是有可能购买的时间不同、折旧率不同，也就是说当前的价值有不同。比如：在2022年买了10个Nike 5号足球、2026年又买了5个同样的。那么在浏览Asset List的时候只显示一条记录：Ball, Nike, 5, 15。但是在盘点club当前资产的时候，这两批球的价值是不一样的。评估下这点是否能实现！
- 4. 借出时不用区分是哪批，同等等待;
- 5. 不需要考虑当前数据库中的记录，目前还是测试阶段，所有数据均可以删除