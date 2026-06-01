# SportStock Frontend

React + TypeScript + Vite web application for the SportStock club equipment management platform.

## Tech Stack

- **React 19** + **TypeScript**
- **Ant Design 6** — UI component library
- **React Router v7** — client-side routing
- **Axios** — HTTP client with JWT interceptor
- **Vite 8** — dev server and bundler

## Prerequisites

- Node.js 18+
- Backend API running on port 3000 (see `../backend/README.md`)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Starts the dev server at `http://localhost:5173`.

All `/api/*` requests are proxied to `http://localhost:3000`, so the backend must be running before making API calls.

## Build

```bash
npm run build
```

Output is written to `dist/`. Type-checks with `tsc` before bundling.

## Preview Production Build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build.

## Lint

```bash
npm run lint
```

## Project Structure

```
src/
├── api/
│   ├── client.ts          # Axios instance — attaches JWT, redirects on 401
│   ├── auth.ts            # Auth API calls (register, login, verify, reset)
│   ├── assets.ts          # Assets + categories CRUD
│   ├── clubs.ts           # Club profile read/update
│   ├── loans.ts           # Loan lifecycle (submit, approve, checkout, return)
│   ├── users.ts           # Club member management
│   └── write-offs.ts      # Write-off order listing and creation
├── contexts/
│   └── AuthContext.tsx    # User/token state, persisted in localStorage
├── layouts/
│   └── DashboardLayout.tsx # Sidebar nav + header shell for authenticated pages
├── pages/
│   ├── Home/              # Public landing page
│   ├── Login/             # Login + forgot-password flow
│   ├── Register/          # Club registration + email OTP verification
│   ├── Dashboard/         # Summary stats, recent activity
│   ├── Assets/            # Asset list, create/edit modal, image upload
│   ├── Loans/             # Loan list, submit request, approve/reject/checkout/return
│   ├── Users/             # Club member list, invite and manage members
│   ├── WriteOffs/         # Write-off order list and manual write-off creation
│   └── ClubProfile/       # Club settings and logo upload
├── types/
│   └── index.ts           # Shared TypeScript types
├── router/
│   └── index.tsx          # Route definitions (public + protected)
├── App.tsx
└── main.tsx
```

## Routing

Public routes (no auth required):

| Path | Page |
|------|------|
| `/` | Home (landing page) |
| `/login` | Login |
| `/register` | Club registration |

Protected routes (redirect to `/login` if no JWT):

| Path | Page |
|------|------|
| `/dashboard` | Dashboard overview |
| `/dashboard/assets` | Asset management |
| `/dashboard/loans` | Loan management |
| `/dashboard/users` | User management |
| `/dashboard/write-offs` | Write-off orders |
| `/dashboard/club` | Club profile settings |

## Environment

No `.env` file is needed for local development — the Vite dev proxy forwards `/api/*` requests to `http://localhost:3000`.

For production deployment on Vercel, set:

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base URL (e.g. `https://sportstock-api.vercel.app`) |

## Deployment

Deployed as a static site on Vercel. `vercel.json` contains a catch-all rewrite rule so that React Router handles all navigation client-side and direct URL access or F5 page refresh never returns a 404:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
