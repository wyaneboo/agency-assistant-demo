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

Required AI variable for LangChain/LangGraph agents with Gemini:

```bash
GOOGLE_API_KEY=
```

Optional model override:

```bash
GEMINI_MODEL=gemini-2.5-flash
```

Optional LangSmith tracing variables:

```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=agency-hub-agent
LANGCHAIN_CALLBACKS_BACKGROUND=false
# LANGSMITH_ENDPOINT=https://api.smith.langchain.com
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

## Python Agent

Install the Python agent dependencies into the local virtual environment:

```bash
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Ask Gemini about the `cases`, `claims`, and `tasks` tables:

```bash
.\.venv\Scripts\python.exe agentai_main.py "Which tasks are overdue?"
```

The agent reads Supabase through the REST API. For local server-side use, set `SUPABASE_SERVICE_ROLE_KEY` in `.env`. To test with RLS as a signed-in user, set `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_ACCESS_TOKEN` instead.

Start the LangGraph development server:

```bash
$env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\langgraph.exe dev --no-browser --allow-blocking
```

The default API is `http://localhost:2024`, with docs at `http://localhost:2024/docs`. In LangSmith Studio, use:

```text
https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

Test the running server from PowerShell:

```powershell
$body = @{
  assistant_id = "agent"
  input = @{
    question = "Which tasks are overdue?"
    limit = 10
  }
  stream_mode = "values"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:2024/runs/wait" `
  -ContentType "application/json" `
  -Body $body
```

## Google Login Setup

Google login is handled by Supabase Auth. The local `.env` file only contains the Supabase project URL and publishable key; it must not contain the Google client secret.

For project `bgvejguabisjurwwcatd`, configure Google OAuth as follows:

1. In Google Cloud Console, create an OAuth client with application type `Web application`.
2. Add this authorized redirect URI:

```text
https://bgvejguabisjurwwcatd.supabase.co/auth/v1/callback
```

3. In Supabase Dashboard, open `Authentication > Providers > Google`.
4. Enable Google and paste the Google OAuth Client ID and Client Secret.
5. In Supabase Auth URL settings, allow local development redirects such as:

```text
http://127.0.0.1:5173/
http://localhost:8080/
```

The error `Unsupported provider: missing OAuth secret` means step 4 is not complete in Supabase.

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
