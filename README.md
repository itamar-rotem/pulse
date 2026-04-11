# Pulse — AI Dev Health Monitor

Real-time token consumption monitoring for AI coding tools. Track your Claude Code sessions, see burn rates, classify human vs agent usage, and understand your costs.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL + Redis)

### Setup

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/itamar-rotem/pulse.git
   cd pulse
   pnpm install
   ```

2. Start the database services:

   ```bash
   docker compose up -d
   ```

3. Push the database schema:

   ```bash
   pnpm db:generate
   pnpm db:push
   ```

4. Start all services in dev mode:

   ```bash
   pnpm dev
   ```

   This starts:
   - **API server** at `http://localhost:3001`
   - **Web dashboard** at `http://localhost:3000`
   - **Agent** watching your Claude Code sessions

5. Open `http://localhost:3000/live` to see the Live View.

## Architecture

```
packages/
  shared/   — TypeScript types, pricing tables, utilities
  agent/    — CLI background process that reads Claude Code session files
  api/      — Express + WebSocket API server with PostgreSQL
  web/      — Next.js 16 dashboard with real-time updates
```

## Agent CLI

```bash
# Start monitoring
npx pulse-agent start

# Check status
npx pulse-agent status
```

## Features

### Observability (Phase 1)
- Real-time token consumption monitoring for Claude Code
- Session classification: human vs agent (CI/automation detection)
- Live View dashboard with token gauge, burn rate, and cost meter
- Session history with filtering and detail views
- Per-model cost calculation (Opus, Sonnet, Haiku)

### Intelligence Engine
- Rule engine for budget caps, rate limits, and anomaly triggers
- Multi-channel alerting (webhooks, in-app)
- Automatic anomaly detection on cost spikes and error rates
- Daily/weekly insight generation from session history

### Multi-tenancy & Auth
- Clerk-backed org/user auth with role-gated routes (`OWNER`/`ADMIN`/`MEMBER`)
- Prisma query extension enforces per-org isolation on every read and write
- Org-scoped API keys (legacy `AGENT_API_KEY` still supported, deprecated)

### Multi-Project (v0.2.0)
- First-class `Project` model with compound-unique `(orgId, slug)`
- Projects auto-created on first agent session (race-safe via compound upsert)
- Per-project monthly budget caps auto-materialize into `COST_CAP_PROJECT` rules
- Archive/restore flow keeps budget rules in sync with project status
- Project filter dropdowns across sessions, live, alerts, and insights
- Projects list, detail, and settings pages with 30d cost + session aggregates

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Agent:** Node.js, chokidar, WebSocket client
- **API:** Express, Prisma, PostgreSQL, Redis, WebSocket
- **Dashboard:** Next.js 16, Tailwind CSS v4, shadcn/ui, Recharts
- **Testing:** Vitest

## License

MIT
