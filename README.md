# Agency Hub

Draft TanStack Start website for an insurance agency operations dashboard.

## Requirements

- Node.js 20.19 or newer
- npm
- Supabase environment variables in `.env`

Required Supabase variables:

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Install

```bash
npm ci
```

## Develop

Start the local development server:

```bash
npm run dev
```

The Vite config defaults to `http://localhost:8080`. To run on the same host and port used for smoke testing:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/login` and confirm the Agency Ops sign-in screen renders.

## Test Run

Run the production build check:

```bash
npm run build
```

Run a quick local smoke check:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open `http://127.0.0.1:5173/login`. The page should show the Agency Ops login card, and the Sign in / Sign up tabs should switch normally.

## Scripts

- `npm run dev` starts the local Vite development server.
- `npm run build` builds the client and server bundles.
- `npm run build:dev` builds with Vite development mode.
- `npm run preview` previews a built app.
- `npm run lint` runs ESLint.
- `npm run format` formats the project with Prettier.
