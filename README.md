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
  web/      — Next.js 14 dashboard with real-time updates
```

## Agent CLI

```bash
# Start monitoring
npx pulse-agent start

# Check status
npx pulse-agent status
```

## Features (Phase 1)

- Real-time token consumption monitoring for Claude Code
- Session classification: human vs agent (CI/automation detection)
- Project tagging via git remote URL
- Live View dashboard with token gauge, burn rate, and cost meter
- Session history with filtering and detail views
- Per-model cost calculation (Opus, Sonnet, Haiku)

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Agent:** Node.js, chokidar, WebSocket client
- **API:** Express, Prisma, PostgreSQL, Redis, WebSocket
- **Dashboard:** Next.js 16, Tailwind CSS v4, shadcn/ui, Recharts
- **Testing:** Vitest

## License

MIT
