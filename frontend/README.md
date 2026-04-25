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
│   └── auth.ts            # Auth API calls (register, login, verify, reset)
├── contexts/
│   └── AuthContext.tsx    # User/token state, persisted in localStorage
├── pages/
│   ├── Home/              # Landing page
│   ├── Login/             # Login + forgot-password flow
│   └── Register/          # Club registration + email OTP verification
├── router/
│   └── index.tsx          # Route definitions
├── App.tsx
└── main.tsx
```

## Environment

No `.env` file is needed for development — the Vite proxy handles API routing.

For production deployment on Vercel, set:

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base URL (if not using a proxy) |
