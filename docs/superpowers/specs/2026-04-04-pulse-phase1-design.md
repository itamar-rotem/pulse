# Pulse Phase 1 — Design Spec

**Date:** 2026-04-04
**Scope:** Claude Code agent + API server + Live View dashboard + session history

---

## Architecture

Monorepo (`pnpm` workspaces) with four packages:

```
pulse/
├── packages/
│   ├── shared/     # TypeScript types, constants, pricing tables
│   ├── agent/      # CLI background process (Node.js)
│   ├── api/        # Express + WebSocket API server
│   └── web/        # Next.js 14 dashboard
├── docker-compose.yml   # PostgreSQL 16 + Redis 7
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Package: `@pulse/shared`

Shared TypeScript types and constants consumed by all packages.

- Session types: `human | agent_local | agent_remote`
- Tool enum: `claude_code | cursor | windsurf`
- Token event shape, session shape, alert shape
- Pricing table: per-model input/output/cache token rates
- Project slug normalization utility (git remote URL → slug)

## Package: `@pulse/agent`

CLI background process. Installed globally via `npm i -g @pulse/agent` or run with `npx`.

**Commands:**
- `pulse-agent start` — starts background watcher (daemonized via `--daemon` flag, or foreground)
- `pulse-agent stop` — stops the background watcher
- `pulse-agent status` — shows current state, active sessions, connection status

**Core modules:**
1. **Claude Code Reader** — watches `~/.claude/projects/` for JSONL conversation files using `chokidar`. Parses session metadata, extracts token counts per message, computes deltas.
2. **Session Classifier** — determines `human` vs `agent_local` by: TTY detection on the originating process, `CI` env var check, time-of-day heuristic (configurable). Manual override via config.
3. **Project Tagger** — resolves git remote URL from the working directory embedded in session path. Normalizes to a slug (e.g., `github.com/org/repo` → `org/repo`). Fallback: directory name.
4. **Telemetry Streamer** — connects to API server via WebSocket. Sends incremental token events every 5 seconds. Buffers locally if server is unreachable (SQLite file buffer). Reconnects with exponential backoff.
5. **Local REST API** — `localhost:7823` — exposes `/status`, `/sessions/active`, `/sessions/history` for the dashboard to query directly if offline.

**Privacy:** Only sends: token counts, timestamps, model name, project slug, session type, tool name. Never sends prompt content.

## Package: `@pulse/api`

Express.js + TypeScript API server.

**Database:** PostgreSQL 16 via Prisma ORM. Schema matches the PRD (sessions, token_events, projects, alerts, suggestions, waste_scores).

**Real-time:** WebSocket server (via `ws` library) for:
- Agent → API: token event ingestion
- API → Dashboard: live session updates via pub/sub through Redis

**Key endpoints (Phase 1):**
- `POST /api/sessions/start` — agent reports new session
- `POST /api/sessions/update` — agent sends token delta
- `POST /api/sessions/end` — agent reports session end
- `GET /api/sessions/live` — WebSocket upgrade for live dashboard
- `GET /api/sessions/history` — paginated session list with filters
- `GET /api/dashboard/live-summary` — aggregated current stats
- `GET /api/health` — health check

**Auth (Phase 1):** API key per agent instance, generated on first setup. JWT for dashboard users (simple email/password, no OAuth yet).

## Package: `@pulse/web`

Next.js 14 (App Router) + Tailwind CSS + shadcn/ui + Recharts.

**Pages:**
1. `/` — Dashboard home with today's summary
2. `/live` — Real-time Live View (the core Phase 1 screen)
   - Active session panel: tool badge, session type badge, circular token gauge, burn rate, cost meter, time remaining estimate
   - Today's summary strip: total spend, human vs agent split, session count
   - Savings hero (placeholder in Phase 1 — shows cumulative cost tracked)
3. `/sessions` — Session history table with filters (date, tool, project, session type)
4. `/sessions/[id]` — Session detail: token timeline chart, cost breakdown, model used
5. `/settings` — Agent connection status, alert preferences (Phase 1: in-app only)

**Real-time:** Dashboard connects to API WebSocket, updates Live View components on each token event. Uses React state + context for live data, SWR for historical queries.

## Data Flow

```
Claude Code writes JSONL → Agent watches files → Agent parses + classifies
  → Agent sends token_event via WebSocket → API persists to PostgreSQL
  → API publishes to Redis → API pushes to Dashboard WebSocket
  → Dashboard updates Live View in real-time
```

## Local Development

`docker-compose up` starts PostgreSQL + Redis. Each package has its own `dev` script. Root `pnpm dev` runs all packages concurrently via `turbo`.

## Phase 1 Boundaries

**In scope:** Claude Code monitoring, session classification, project tagging, live view, session history, basic cost tracking.

**Deferred to Phase 2+:** Anomaly detection, alerts, smart suggestions, task pause, savings dashboard, Consumption Intelligence View, Cursor/Windsurf support, team features, budgets.
