# Pulse Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core Pulse platform — a Claude Code session monitor with real-time live view dashboard, session classification (human vs agent), project tagging, and cost tracking.

**Architecture:** pnpm monorepo with 4 packages: `@pulse/shared` (types/constants), `@pulse/agent` (CLI file watcher), `@pulse/api` (Express + WebSocket + Prisma), `@pulse/web` (Next.js 14 dashboard). PostgreSQL + Redis via Docker Compose.

**Tech Stack:** Node.js 24, TypeScript 5, pnpm workspaces, Prisma, Express, ws, Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Recharts, Docker Compose, Vitest.

---

## File Structure

```
pulse/
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # Workspace definition
├── tsconfig.base.json                    # Shared TS config
├── docker-compose.yml                    # PostgreSQL 16 + Redis 7
├── .gitignore
├── .env.example
├── README.md
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Re-exports
│   │   │   ├── types.ts                  # All shared types
│   │   │   ├── pricing.ts                # Model pricing table
│   │   │   ├── project-slug.ts           # Git remote → slug util
│   │   │   └── cost.ts                   # Cost calculation util
│   │   └── tests/
│   │       ├── pricing.test.ts
│   │       ├── project-slug.test.ts
│   │       └── cost.test.ts
│   ├── agent/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # CLI entry (commander)
│   │   │   ├── claude-reader.ts          # JSONL file watcher + parser
│   │   │   ├── session-classifier.ts     # human vs agent detection
│   │   │   ├── session-tracker.ts        # Tracks active sessions, computes deltas
│   │   │   ├── telemetry-streamer.ts     # WebSocket client to API
│   │   │   ├── local-server.ts           # localhost:7823 REST API
│   │   │   └── config.ts                 # Agent config (API URL, key, etc.)
│   │   └── tests/
│   │       ├── claude-reader.test.ts
│   │       ├── session-classifier.test.ts
│   │       └── session-tracker.test.ts
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   ├── index.ts                  # Server entry
│   │   │   ├── app.ts                    # Express app factory
│   │   │   ├── ws-server.ts              # WebSocket server (agent ingestion + dashboard broadcast)
│   │   │   ├── routes/
│   │   │   │   ├── sessions.ts           # /api/sessions/*
│   │   │   │   ├── dashboard.ts          # /api/dashboard/*
│   │   │   │   └── health.ts             # /api/health
│   │   │   ├── services/
│   │   │   │   ├── session-service.ts    # Session CRUD + aggregation
│   │   │   │   └── redis.ts             # Redis pub/sub wrapper
│   │   │   └── middleware/
│   │   │       └── auth.ts               # API key + JWT middleware
│   │   └── tests/
│   │       ├── app.test.ts
│   │       ├── sessions.test.ts
│   │       └── session-service.test.ts
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx              # Dashboard home
│       │   │   ├── live/
│       │   │   │   └── page.tsx          # Live View
│       │   │   ├── sessions/
│       │   │   │   ├── page.tsx          # Session history
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx      # Session detail
│       │   │   └── settings/
│       │   │       └── page.tsx          # Settings
│       │   ├── components/
│       │   │   ├── ui/                   # shadcn/ui components
│       │   │   ├── layout/
│       │   │   │   ├── sidebar.tsx
│       │   │   │   └── header.tsx
│       │   │   ├── live/
│       │   │   │   ├── active-session-panel.tsx
│       │   │   │   ├── token-gauge.tsx
│       │   │   │   ├── burn-rate.tsx
│       │   │   │   ├── cost-meter.tsx
│       │   │   │   └── today-summary.tsx
│       │   │   └── sessions/
│       │   │       ├── session-table.tsx
│       │   │       └── session-detail.tsx
│       │   ├── hooks/
│       │   │   ├── use-websocket.ts
│       │   │   └── use-sessions.ts
│       │   └── lib/
│       │       ├── api.ts                # API client
│       │       └── utils.ts
│       └── components.json               # shadcn/ui config
```

---

### Task 1: Repository Scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/agent/package.json`, `packages/agent/tsconfig.json`
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`

- [ ] **Step 1: Initialize git repo and create root configs**

```bash
cd C:/Users/Itamar/MyProjects/pulse
git init
```

`package.json`:
```json
{
  "name": "pulse",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "db:push": "pnpm --filter @pulse/api db:push",
    "db:generate": "pnpm --filter @pulse/api db:generate"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  },
  "packageManager": "pnpm@10.33.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.next/
.env
.env.local
*.tsbuildinfo
.turbo/
coverage/
```

`.env.example`:
```
DATABASE_URL=postgresql://pulse:pulse@localhost:5432/pulse
REDIS_URL=redis://localhost:6379
API_PORT=3001
AGENT_API_KEY=change-me-in-production
JWT_SECRET=change-me-in-production
```

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pulse
      POSTGRES_PASSWORD: pulse
      POSTGRES_DB: pulse
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

- [ ] **Step 2: Create @pulse/shared package**

`packages/shared/package.json`:
```json
{
  "name": "@pulse/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 3: Create @pulse/agent package**

`packages/agent/package.json`:
```json
{
  "name": "@pulse/agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "pulse-agent": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pulse/shared": "workspace:*",
    "chokidar": "^4.0.0",
    "commander": "^13.0.0",
    "express": "^5.1.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.18.0",
    "tsx": "^4.19.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/agent/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 4: Create @pulse/api package**

`packages/api/package.json`:
```json
{
  "name": "@pulse/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@pulse/shared": "workspace:*",
    "@prisma/client": "^6.9.0",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "ioredis": "^5.6.0",
    "jsonwebtoken": "^9.0.2",
    "ws": "^8.18.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/ws": "^8.18.0",
    "prisma": "^6.9.0",
    "tsx": "^4.19.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 5: Create @pulse/web package with Next.js**

Initialize Next.js with:
```bash
cd packages/web
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git --use-pnpm
```

Then add dependencies:
```bash
pnpm add @pulse/shared@workspace:* recharts swr
pnpm add -D @types/node
```

- [ ] **Step 6: Install all dependencies and verify workspace**

```bash
cd C:/Users/Itamar/MyProjects/pulse
pnpm install
```

Verify: `pnpm ls --depth 0 -r` shows all 4 packages.

- [ ] **Step 7: Commit scaffolding**

```bash
git add -A
git commit -m "feat: initialize monorepo scaffolding with 4 packages"
```

---

### Task 2: @pulse/shared — Types, Pricing, and Utilities

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/pricing.ts`
- Create: `packages/shared/src/project-slug.ts`
- Create: `packages/shared/src/cost.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/pricing.test.ts`
- Create: `packages/shared/tests/project-slug.test.ts`
- Create: `packages/shared/tests/cost.test.ts`

- [ ] **Step 1: Write tests for project slug normalization**

`packages/shared/tests/project-slug.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeProjectSlug } from '../src/project-slug.js';

describe('normalizeProjectSlug', () => {
  it('extracts slug from HTTPS git remote URL', () => {
    expect(normalizeProjectSlug('https://github.com/acme/payments-service.git'))
      .toBe('acme/payments-service');
  });

  it('extracts slug from SSH git remote URL', () => {
    expect(normalizeProjectSlug('git@github.com:acme/payments-service.git'))
      .toBe('acme/payments-service');
  });

  it('handles URLs without .git suffix', () => {
    expect(normalizeProjectSlug('https://github.com/acme/payments-service'))
      .toBe('acme/payments-service');
  });

  it('handles GitLab URLs', () => {
    expect(normalizeProjectSlug('https://gitlab.com/org/subgroup/repo.git'))
      .toBe('org/subgroup/repo');
  });

  it('falls back to directory name for non-URL input', () => {
    expect(normalizeProjectSlug('/home/user/projects/my-app'))
      .toBe('my-app');
  });

  it('falls back to directory name for Windows paths', () => {
    expect(normalizeProjectSlug('C:\\Users\\dev\\projects\\my-app'))
      .toBe('my-app');
  });

  it('returns "unknown" for empty input', () => {
    expect(normalizeProjectSlug('')).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/Itamar/MyProjects/pulse
pnpm --filter @pulse/shared test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement project slug normalization**

`packages/shared/src/project-slug.ts`:
```typescript
export function normalizeProjectSlug(input: string): string {
  if (!input) return 'unknown';

  // SSH format: git@github.com:org/repo.git
  const sshMatch = input.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://github.com/org/repo.git
  try {
    const url = new URL(input);
    const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    if (path) return path;
  } catch {
    // Not a URL — fall through to directory extraction
  }

  // Fallback: extract last path segment as directory name
  const normalized = input.replace(/\\/g, '/').replace(/\/$/, '');
  const lastSegment = normalized.split('/').pop();
  return lastSegment || 'unknown';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @pulse/shared test
```
Expected: all 7 tests PASS.

- [ ] **Step 5: Write tests for pricing and cost calculation**

`packages/shared/tests/pricing.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getModelPricing, PRICING_TABLE } from '../src/pricing.js';

describe('getModelPricing', () => {
  it('returns pricing for claude-sonnet-4-6', () => {
    const pricing = getModelPricing('claude-sonnet-4-6');
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1M).toBeGreaterThan(0);
    expect(pricing!.outputPer1M).toBeGreaterThan(0);
  });

  it('returns pricing for claude-opus-4-6', () => {
    const pricing = getModelPricing('claude-opus-4-6');
    expect(pricing).toBeDefined();
    expect(pricing!.inputPer1M).toBeGreaterThan(pricing!.cachePer1M!);
  });

  it('returns null for unknown model', () => {
    expect(getModelPricing('gpt-5-turbo')).toBeNull();
  });

  it('matches partial model names', () => {
    const pricing = getModelPricing('claude-sonnet-4-6');
    expect(pricing).toBeDefined();
  });
});
```

`packages/shared/tests/cost.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { calculateCost } from '../src/cost.js';

describe('calculateCost', () => {
  it('calculates cost for a session with input and output tokens', () => {
    const cost = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      outputTokens: 5000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBeGreaterThan(0);
    expect(typeof cost).toBe('number');
  });

  it('accounts for cache tokens being cheaper', () => {
    const costNocache = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000,
      outputTokens: 1000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    const costWithCache = calculateCost({
      model: 'claude-sonnet-4-6',
      inputTokens: 5000,
      outputTokens: 1000,
      cacheCreationTokens: 0,
      cacheReadTokens: 5000,
    });
    expect(costWithCache).toBeLessThan(costNocache);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCost({
      model: 'unknown-model',
      inputTokens: 10000,
      outputTokens: 5000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
pnpm --filter @pulse/shared test
```
Expected: FAIL for pricing and cost tests.

- [ ] **Step 7: Implement types**

`packages/shared/src/types.ts`:
```typescript
export type SessionType = 'human' | 'agent_local' | 'agent_remote';
export type ToolName = 'claude_code' | 'cursor' | 'windsurf';

export interface TokenEvent {
  sessionId: string;
  timestamp: string;
  tool: ToolName;
  model: string;
  projectSlug: string;
  sessionType: SessionType;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costDeltaUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
}

export interface Session {
  id: string;
  tool: ToolName;
  projectSlug: string;
  sessionType: SessionType;
  model: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface LiveSummary {
  activeSessions: number;
  totalCostToday: number;
  humanCostToday: number;
  agentCostToday: number;
  humanSessionsToday: number;
  agentSessionsToday: number;
  currentBurnRatePerMin: number;
}

export interface SessionHistoryQuery {
  page?: number;
  limit?: number;
  tool?: ToolName;
  projectSlug?: string;
  sessionType?: SessionType;
  startDate?: string;
  endDate?: string;
}

export interface CostInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
```

- [ ] **Step 8: Implement pricing table**

`packages/shared/src/pricing.ts`:
```typescript
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheCreationPer1M: number;
  cachePer1M: number;
}

// Prices in USD per 1M tokens (as of April 2026)
export const PRICING_TABLE: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cacheCreationPer1M: 18.75,
    cachePer1M: 1.5,
  },
  'claude-sonnet-4-6': {
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheCreationPer1M: 3.75,
    cachePer1M: 0.3,
  },
  'claude-haiku-4-5': {
    inputPer1M: 0.8,
    outputPer1M: 4.0,
    cacheCreationPer1M: 1.0,
    cachePer1M: 0.08,
  },
};

export function getModelPricing(model: string): ModelPricing | null {
  // Direct match first
  if (PRICING_TABLE[model]) return PRICING_TABLE[model];

  // Partial match: find the first key that the model string contains
  for (const [key, pricing] of Object.entries(PRICING_TABLE)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }

  return null;
}
```

- [ ] **Step 9: Implement cost calculation**

`packages/shared/src/cost.ts`:
```typescript
import type { CostInput } from './types.js';
import { getModelPricing } from './pricing.js';

export function calculateCost(input: CostInput): number {
  const pricing = getModelPricing(input.model);
  if (!pricing) return 0;

  const inputCost = (input.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (input.outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheCreationCost = (input.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPer1M;
  const cacheReadCost = (input.cacheReadTokens / 1_000_000) * pricing.cachePer1M;

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}
```

- [ ] **Step 10: Create barrel export**

`packages/shared/src/index.ts`:
```typescript
export * from './types.js';
export * from './pricing.js';
export * from './cost.js';
export * from './project-slug.js';
```

- [ ] **Step 11: Run all tests to verify they pass**

```bash
pnpm --filter @pulse/shared test
```
Expected: all tests PASS.

- [ ] **Step 12: Build shared package and commit**

```bash
pnpm --filter @pulse/shared build
git add packages/shared/
git commit -m "feat(shared): add types, pricing table, cost calc, and project slug utils"
```

---

### Task 3: @pulse/api — Prisma Schema and Database Setup

**Files:**
- Create: `packages/api/prisma/schema.prisma`
- Create: `packages/api/src/index.ts`
- Create: `packages/api/src/app.ts`

- [ ] **Step 1: Write Prisma schema**

`packages/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id                  String        @id @default(uuid())
  tool                String        // claude_code | cursor | windsurf
  projectSlug         String        @map("project_slug")
  sessionType         String        @map("session_type") // human | agent_local | agent_remote
  model               String
  startedAt           DateTime      @default(now()) @map("started_at")
  endedAt             DateTime?     @map("ended_at")
  inputTokens         Int           @default(0) @map("input_tokens")
  outputTokens        Int           @default(0) @map("output_tokens")
  cacheCreationTokens Int           @default(0) @map("cache_creation_tokens")
  cacheReadTokens     Int           @default(0) @map("cache_read_tokens")
  costUsd             Float         @default(0) @map("cost_usd")
  tokenEvents         TokenEvent[]

  @@map("sessions")
}

model TokenEvent {
  id                    String   @id @default(uuid())
  sessionId             String   @map("session_id")
  timestamp             DateTime @default(now())
  tool                  String
  model                 String
  projectSlug           String   @map("project_slug")
  sessionType           String   @map("session_type")
  inputTokens           Int      @map("input_tokens")
  outputTokens          Int      @map("output_tokens")
  cacheCreationTokens   Int      @default(0) @map("cache_creation_tokens")
  cacheReadTokens       Int      @default(0) @map("cache_read_tokens")
  costDeltaUsd          Float    @map("cost_delta_usd")
  cumulativeInputTokens Int      @map("cumulative_input_tokens")
  cumulativeOutputTokens Int     @map("cumulative_output_tokens")
  cumulativeCostUsd     Float    @map("cumulative_cost_usd")
  burnRatePerMin        Float    @map("burn_rate_per_min")

  session               Session  @relation(fields: [sessionId], references: [id])

  @@index([sessionId])
  @@index([timestamp])
  @@map("token_events")
}
```

- [ ] **Step 2: Create .env for API package**

`packages/api/.env`:
```
DATABASE_URL=postgresql://pulse:pulse@localhost:5432/pulse
REDIS_URL=redis://localhost:6379
API_PORT=3001
AGENT_API_KEY=dev-agent-key-change-in-production
JWT_SECRET=dev-jwt-secret-change-in-production
```

- [ ] **Step 3: Start Docker services and push schema**

```bash
cd C:/Users/Itamar/MyProjects/pulse
docker compose up -d
pnpm --filter @pulse/api db:generate
pnpm --filter @pulse/api db:push
```

Expected: PostgreSQL tables created, Prisma client generated.

- [ ] **Step 4: Create Express app factory**

`packages/api/src/app.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { authMiddleware } from './middleware/auth.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/sessions', authMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, dashboardRouter);

  return app;
}
```

- [ ] **Step 5: Create server entry point**

`packages/api/src/index.ts`:
```typescript
import { createServer } from 'http';
import { createApp } from './app.js';
import { createWsServer } from './ws-server.js';
import { redis } from './services/redis.js';

const port = parseInt(process.env.API_PORT || '3001', 10);
const app = createApp();
const server = createServer(app);

createWsServer(server);

server.listen(port, () => {
  console.log(`Pulse API running on http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  redis.disconnect();
  server.close();
  process.exit(0);
});
```

- [ ] **Step 6: Commit database setup**

```bash
git add packages/api/prisma packages/api/src/index.ts packages/api/src/app.ts packages/api/.env packages/api/package.json packages/api/tsconfig.json
git commit -m "feat(api): add Prisma schema and Express app skeleton"
```

---

### Task 4: @pulse/api — Routes, Services, and WebSocket Server

**Files:**
- Create: `packages/api/src/routes/health.ts`
- Create: `packages/api/src/routes/sessions.ts`
- Create: `packages/api/src/routes/dashboard.ts`
- Create: `packages/api/src/services/session-service.ts`
- Create: `packages/api/src/services/redis.ts`
- Create: `packages/api/src/middleware/auth.ts`
- Create: `packages/api/src/ws-server.ts`
- Create: `packages/api/tests/app.test.ts`

- [ ] **Step 1: Write test for health endpoint**

`packages/api/tests/app.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

Add `supertest` to api devDependencies:
```bash
pnpm --filter @pulse/api add -D supertest @types/supertest
```

- [ ] **Step 2: Implement health route**

`packages/api/src/routes/health.ts`:
```typescript
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

- [ ] **Step 3: Implement auth middleware**

`packages/api/src/middleware/auth.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';

const AGENT_API_KEY = process.env.AGENT_API_KEY || 'dev-agent-key-change-in-production';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;

  // Accept API key (for agent) or Bearer token (for dashboard)
  if (apiKey === AGENT_API_KEY) {
    next();
    return;
  }

  if (authHeader?.startsWith('Bearer ')) {
    // Phase 1: accept any bearer token for dashboard dev
    // TODO Phase 2: validate JWT properly
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
```

- [ ] **Step 4: Implement Redis pub/sub wrapper**

`packages/api/src/services/redis.ts`:
```typescript
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, { lazyConnect: true });
export const redisSub = new Redis(REDIS_URL, { lazyConnect: true });

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    await redisSub.connect();
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis connection failed, running without pub/sub:', (err as Error).message);
  }
}

export async function publishTokenEvent(event: unknown): Promise<void> {
  try {
    await redis.publish('pulse:token_events', JSON.stringify(event));
  } catch {
    // Redis not available — dashboard won't get real-time updates
  }
}

export async function publishSessionUpdate(session: unknown): Promise<void> {
  try {
    await redis.publish('pulse:session_updates', JSON.stringify(session));
  } catch {
    // Redis not available
  }
}
```

- [ ] **Step 5: Implement session service**

`packages/api/src/services/session-service.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import type { TokenEvent } from '@pulse/shared';
import { publishTokenEvent, publishSessionUpdate } from './redis.js';

const prisma = new PrismaClient();

export async function startSession(data: {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
}) {
  const session = await prisma.session.create({
    data: {
      id: data.id,
      tool: data.tool,
      projectSlug: data.projectSlug,
      sessionType: data.sessionType,
      model: data.model,
    },
  });
  await publishSessionUpdate(session);
  return session;
}

export async function updateSession(data: {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costDeltaUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  model: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
}) {
  // Create token event
  const event = await prisma.tokenEvent.create({
    data: {
      sessionId: data.sessionId,
      tool: data.tool,
      model: data.model,
      projectSlug: data.projectSlug,
      sessionType: data.sessionType,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      cacheReadTokens: data.cacheReadTokens,
      costDeltaUsd: data.costDeltaUsd,
      cumulativeInputTokens: data.cumulativeInputTokens,
      cumulativeOutputTokens: data.cumulativeOutputTokens,
      cumulativeCostUsd: data.cumulativeCostUsd,
      burnRatePerMin: data.burnRatePerMin,
    },
  });

  // Update session totals
  const session = await prisma.session.update({
    where: { id: data.sessionId },
    data: {
      inputTokens: data.cumulativeInputTokens,
      outputTokens: data.cumulativeOutputTokens,
      cacheCreationTokens: { increment: data.cacheCreationTokens },
      cacheReadTokens: { increment: data.cacheReadTokens },
      costUsd: data.cumulativeCostUsd,
      model: data.model,
    },
  });

  await publishTokenEvent(event);
  await publishSessionUpdate(session);
  return { event, session };
}

export async function endSession(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });
  await publishSessionUpdate(session);
  return session;
}

export async function getSessionHistory(query: {
  page?: number;
  limit?: number;
  tool?: string;
  projectSlug?: string;
  sessionType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (query.tool) where.tool = query.tool;
  if (query.projectSlug) where.projectSlug = query.projectSlug;
  if (query.sessionType) where.sessionType = query.sessionType;
  if (query.startDate || query.endDate) {
    where.startedAt = {};
    if (query.startDate) (where.startedAt as Record<string, unknown>).gte = new Date(query.startDate);
    if (query.endDate) (where.startedAt as Record<string, unknown>).lte = new Date(query.endDate);
  }

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.session.count({ where }),
  ]);

  return { sessions, total, page, limit };
}

export async function getSessionById(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: { tokenEvents: { orderBy: { timestamp: 'asc' } } },
  });
}

export async function getLiveSummary() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [activeSessions, todayStats] = await Promise.all([
    prisma.session.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  const humanSessions = activeSessions.filter(s => s.sessionType === 'human');
  const agentSessions = activeSessions.filter(s => s.sessionType !== 'human');

  // Get today's breakdown by type
  const [humanStats, agentStats] = await Promise.all([
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart }, sessionType: 'human' },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart }, sessionType: { not: 'human' } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  return {
    activeSessions: activeSessions.length,
    activeSessionDetails: activeSessions,
    totalCostToday: todayStats._sum.costUsd || 0,
    humanCostToday: humanStats._sum.costUsd || 0,
    agentCostToday: agentStats._sum.costUsd || 0,
    humanSessionsToday: humanStats._count || 0,
    agentSessionsToday: agentStats._count || 0,
  };
}
```

- [ ] **Step 6: Implement session routes**

`packages/api/src/routes/sessions.ts`:
```typescript
import { Router } from 'express';
import {
  startSession,
  updateSession,
  endSession,
  getSessionHistory,
  getSessionById,
} from '../services/session-service.js';

export const sessionsRouter = Router();

sessionsRouter.post('/start', async (req, res) => {
  try {
    const session = await startSession(req.body);
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/update', async (req, res) => {
  try {
    const result = await updateSession(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/end', async (req, res) => {
  try {
    const session = await endSession(req.body.sessionId);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.get('/history', async (req, res) => {
  try {
    const result = await getSessionHistory(req.query as Record<string, string>);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.get('/:id', async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 7: Implement dashboard route**

`packages/api/src/routes/dashboard.ts`:
```typescript
import { Router } from 'express';
import { getLiveSummary } from '../services/session-service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/live-summary', async (_req, res) => {
  try {
    const summary = await getLiveSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 8: Implement WebSocket server**

`packages/api/src/ws-server.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redisSub } from './services/redis.js';

interface TaggedWebSocket extends WebSocket {
  role?: 'agent' | 'dashboard';
  isAlive?: boolean;
}

export function createWsServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Subscribe to Redis channels for broadcasting
  redisSub.subscribe('pulse:token_events', 'pulse:session_updates').catch(() => {
    console.warn('Redis subscribe failed — WebSocket broadcast will use direct relay');
  });

  redisSub.on('message', (channel, message) => {
    const target = channel === 'pulse:token_events' ? 'token_event' : 'session_update';
    broadcast(wss, { type: target, data: JSON.parse(message) }, 'dashboard');
  });

  wss.on('connection', (ws: TaggedWebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    ws.role = url.searchParams.get('role') === 'agent' ? 'agent' : 'dashboard';
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (ws.role === 'agent') {
          // Relay agent messages directly to all dashboard clients
          // (This works even without Redis)
          broadcast(wss, { type: msg.type, data: msg.data }, 'dashboard');
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // Heartbeat to clean up dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: TaggedWebSocket) => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

function broadcast(wss: WebSocketServer, message: unknown, targetRole: string): void {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client: TaggedWebSocket) => {
    if (client.role === targetRole && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
```

- [ ] **Step 9: Run health test**

```bash
pnpm --filter @pulse/api test
```
Expected: health endpoint test PASSES.

- [ ] **Step 10: Commit API server**

```bash
git add packages/api/
git commit -m "feat(api): add REST routes, session service, WebSocket server, and Redis pub/sub"
```

---

### Task 5: @pulse/agent — Claude Code JSONL Reader

**Files:**
- Create: `packages/agent/src/claude-reader.ts`
- Create: `packages/agent/tests/claude-reader.test.ts`

- [ ] **Step 1: Write tests for Claude Code JSONL parser**

`packages/agent/tests/claude-reader.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseJsonlLine, extractUsage, getSessionDir } from '../src/claude-reader.js';

describe('parseJsonlLine', () => {
  it('parses an assistant message with usage data', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-6',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 8,
          cache_creation_input_tokens: 12821,
          cache_read_input_tokens: 6473,
        },
      },
      sessionId: 'abc-123',
      timestamp: '2026-03-15T01:04:03.604Z',
      cwd: 'C:\\Users\\dev\\projects\\my-app',
      userType: 'external',
      entrypoint: 'cli',
    });

    const parsed = parseJsonlLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe('abc-123');
    expect(parsed!.model).toBe('claude-sonnet-4-6');
    expect(parsed!.cwd).toBe('C:\\Users\\dev\\projects\\my-app');
  });

  it('returns null for non-assistant messages', () => {
    const line = JSON.stringify({ type: 'user', message: { role: 'user' } });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('returns null for assistant messages without usage', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(parseJsonlLine(line)).toBeNull();
  });
});

describe('extractUsage', () => {
  it('extracts token counts from usage object', () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    };
    const result = extractUsage(usage);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.cacheCreationTokens).toBe(200);
    expect(result.cacheReadTokens).toBe(300);
  });

  it('defaults missing fields to 0', () => {
    const usage = { input_tokens: 10, output_tokens: 5 };
    const result = extractUsage(usage);
    expect(result.cacheCreationTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
  });
});

describe('getSessionDir', () => {
  it('returns the Claude projects directory path', () => {
    const dir = getSessionDir();
    expect(dir).toContain('.claude');
    expect(dir).toContain('projects');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @pulse/agent test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Claude Code reader**

`packages/agent/src/claude-reader.ts`:
```typescript
import { watch } from 'chokidar';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

export interface ParsedMessage {
  sessionId: string;
  timestamp: string;
  model: string;
  cwd: string;
  entrypoint: string;
  userType: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export function getSessionDir(): string {
  return join(homedir(), '.claude', 'projects');
}

export function extractUsage(usage: Record<string, number>): UsageData {
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
  };
}

export function parseJsonlLine(line: string): ParsedMessage | null {
  try {
    const entry = JSON.parse(line);

    // Only process assistant messages with usage data
    if (entry.type !== 'assistant') return null;
    if (!entry.message?.usage) return null;

    const usage = extractUsage(entry.message.usage);

    return {
      sessionId: entry.sessionId || '',
      timestamp: entry.timestamp || new Date().toISOString(),
      model: entry.message.model || 'unknown',
      cwd: entry.cwd || '',
      entrypoint: entry.entrypoint || '',
      userType: entry.userType || '',
      ...usage,
    };
  } catch {
    return null;
  }
}

export class ClaudeCodeReader extends EventEmitter {
  private fileOffsets = new Map<string, number>();
  private watcher: ReturnType<typeof watch> | null = null;

  start(): void {
    const sessionsDir = getSessionDir();
    console.log(`Watching Claude Code sessions at: ${sessionsDir}`);

    this.watcher = watch(join(sessionsDir, '**/*.jsonl'), {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on('add', (filePath) => this.processFile(filePath));
    this.watcher.on('change', (filePath) => this.processFile(filePath));
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const fileStats = await stat(filePath);
      const currentOffset = this.fileOffsets.get(filePath) || 0;

      if (fileStats.size <= currentOffset) return;

      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Process only new lines (approximate by tracking char offset)
      let charCount = 0;
      for (const line of lines) {
        charCount += line.length + 1; // +1 for newline
        if (charCount <= currentOffset) continue;
        if (!line.trim()) continue;

        const parsed = parseJsonlLine(line);
        if (parsed) {
          this.emit('message', parsed);
        }
      }

      this.fileOffsets.set(filePath, fileStats.size);
    } catch (err) {
      // File may be in the middle of being written — will retry on next change
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @pulse/agent test
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/claude-reader.ts packages/agent/tests/claude-reader.test.ts
git commit -m "feat(agent): add Claude Code JSONL reader with file watcher"
```

---

### Task 6: @pulse/agent — Session Classifier and Tracker

**Files:**
- Create: `packages/agent/src/session-classifier.ts`
- Create: `packages/agent/src/session-tracker.ts`
- Create: `packages/agent/tests/session-classifier.test.ts`
- Create: `packages/agent/tests/session-tracker.test.ts`

- [ ] **Step 1: Write tests for session classifier**

`packages/agent/tests/session-classifier.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifySession } from '../src/session-classifier.js';

describe('classifySession', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('classifies as agent_local when CI env var is set', () => {
    process.env.CI = 'true';
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('agent_local');
  });

  it('classifies as agent_local when GITHUB_ACTIONS is set', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('agent_local');
  });

  it('classifies interactive CLI sessions as human', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    expect(classifySession({ entrypoint: 'cli', userType: 'external' })).toBe('human');
  });

  it('classifies api entrypoint as agent_local', () => {
    expect(classifySession({ entrypoint: 'api', userType: 'external' })).toBe('agent_local');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @pulse/agent test
```
Expected: FAIL.

- [ ] **Step 3: Implement session classifier**

`packages/agent/src/session-classifier.ts`:
```typescript
import type { SessionType } from '@pulse/shared';

interface ClassifyInput {
  entrypoint: string;
  userType: string;
}

export function classifySession(input: ClassifyInput): SessionType {
  // CI environment detection
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI || process.env.JENKINS_URL) {
    return 'agent_local';
  }

  // API-triggered sessions are automated
  if (input.entrypoint === 'api') {
    return 'agent_local';
  }

  // Default: interactive human session
  return 'human';
}
```

- [ ] **Step 4: Run classifier tests**

```bash
pnpm --filter @pulse/agent test
```
Expected: classifier tests PASS.

- [ ] **Step 5: Write session tracker tests**

`packages/agent/tests/session-tracker.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { SessionTracker } from '../src/session-tracker.js';
import type { ParsedMessage } from '../src/claude-reader.js';

describe('SessionTracker', () => {
  it('creates a new tracked session on first message', () => {
    const tracker = new SessionTracker();
    const msg: ParsedMessage = {
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    const event = tracker.processMessage(msg);
    expect(event).not.toBeNull();
    expect(event!.cumulativeInputTokens).toBe(100);
    expect(event!.cumulativeOutputTokens).toBe(50);
    expect(event!.cumulativeCostUsd).toBeGreaterThan(0);
  });

  it('accumulates tokens across messages in same session', () => {
    const tracker = new SessionTracker();
    const base = {
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage({ ...base, timestamp: new Date().toISOString(), inputTokens: 100, outputTokens: 50 });
    const event2 = tracker.processMessage({ ...base, timestamp: new Date().toISOString(), inputTokens: 200, outputTokens: 100 });

    expect(event2!.cumulativeInputTokens).toBe(300);
    expect(event2!.cumulativeOutputTokens).toBe(150);
  });

  it('computes burn rate', () => {
    const tracker = new SessionTracker();
    const now = Date.now();
    const base = {
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage({ ...base, timestamp: new Date(now - 60000).toISOString(), inputTokens: 100, outputTokens: 50 });
    const event2 = tracker.processMessage({ ...base, timestamp: new Date(now).toISOString(), inputTokens: 200, outputTokens: 100 });

    expect(event2!.burnRatePerMin).toBeGreaterThan(0);
  });

  it('returns active sessions list', () => {
    const tracker = new SessionTracker();
    const msg: ParsedMessage = {
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      cwd: '/projects/my-app',
      entrypoint: 'cli',
      userType: 'external',
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    tracker.processMessage(msg);
    const active = tracker.getActiveSessions();
    expect(active).toHaveLength(1);
    expect(active[0].sessionId).toBe('sess-1');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pnpm --filter @pulse/agent test
```
Expected: FAIL.

- [ ] **Step 7: Implement session tracker**

`packages/agent/src/session-tracker.ts`:
```typescript
import { calculateCost, type TokenEvent, type SessionType } from '@pulse/shared';
import { normalizeProjectSlug } from '@pulse/shared';
import { classifySession } from './session-classifier.js';
import type { ParsedMessage } from './claude-reader.js';

interface TrackedSession {
  sessionId: string;
  tool: 'claude_code';
  model: string;
  projectSlug: string;
  sessionType: SessionType;
  startedAt: string;
  lastActivityAt: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheCreationTokens: number;
  cumulativeCacheReadTokens: number;
  cumulativeCostUsd: number;
}

export class SessionTracker {
  private sessions = new Map<string, TrackedSession>();

  processMessage(msg: ParsedMessage): TokenEvent | null {
    let session = this.sessions.get(msg.sessionId);
    const isNew = !session;

    if (!session) {
      session = {
        sessionId: msg.sessionId,
        tool: 'claude_code',
        model: msg.model,
        projectSlug: normalizeProjectSlug(msg.cwd),
        sessionType: classifySession({ entrypoint: msg.entrypoint, userType: msg.userType }),
        startedAt: msg.timestamp,
        lastActivityAt: msg.timestamp,
        cumulativeInputTokens: 0,
        cumulativeOutputTokens: 0,
        cumulativeCacheCreationTokens: 0,
        cumulativeCacheReadTokens: 0,
        cumulativeCostUsd: 0,
      };
      this.sessions.set(msg.sessionId, session);
    }

    // Compute delta cost
    const deltaCost = calculateCost({
      model: msg.model,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      cacheCreationTokens: msg.cacheCreationTokens,
      cacheReadTokens: msg.cacheReadTokens,
    });

    // Update cumulative totals
    session.cumulativeInputTokens += msg.inputTokens;
    session.cumulativeOutputTokens += msg.outputTokens;
    session.cumulativeCacheCreationTokens += msg.cacheCreationTokens;
    session.cumulativeCacheReadTokens += msg.cacheReadTokens;
    session.cumulativeCostUsd += deltaCost;
    session.model = msg.model;
    session.lastActivityAt = msg.timestamp;

    // Compute burn rate (tokens per minute)
    const elapsedMs = new Date(msg.timestamp).getTime() - new Date(session.startedAt).getTime();
    const elapsedMin = Math.max(elapsedMs / 60000, 0.1); // minimum 6 seconds to avoid division issues
    const totalTokens = session.cumulativeInputTokens + session.cumulativeOutputTokens;
    const burnRatePerMin = totalTokens / elapsedMin;

    const event: TokenEvent = {
      sessionId: msg.sessionId,
      timestamp: msg.timestamp,
      tool: 'claude_code',
      model: msg.model,
      projectSlug: session.projectSlug,
      sessionType: session.sessionType,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      cacheCreationTokens: msg.cacheCreationTokens,
      cacheReadTokens: msg.cacheReadTokens,
      costDeltaUsd: deltaCost,
      cumulativeInputTokens: session.cumulativeInputTokens,
      cumulativeOutputTokens: session.cumulativeOutputTokens,
      cumulativeCostUsd: session.cumulativeCostUsd,
      burnRatePerMin,
    };

    return event;
  }

  getActiveSessions(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  markEnded(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
```

- [ ] **Step 8: Run all agent tests**

```bash
pnpm --filter @pulse/agent test
```
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/agent/src/session-classifier.ts packages/agent/src/session-tracker.ts packages/agent/tests/
git commit -m "feat(agent): add session classifier and token tracker with burn rate"
```

---

### Task 7: @pulse/agent — Telemetry Streamer, Local Server, and CLI

**Files:**
- Create: `packages/agent/src/telemetry-streamer.ts`
- Create: `packages/agent/src/local-server.ts`
- Create: `packages/agent/src/config.ts`
- Create: `packages/agent/src/index.ts`

- [ ] **Step 1: Implement agent config**

`packages/agent/src/config.ts`:
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentConfig {
  apiUrl: string;
  apiKey: string;
  localPort: number;
}

const CONFIG_DIR = join(homedir(), '.pulse');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AgentConfig = {
  apiUrl: 'ws://localhost:3001/ws',
  apiKey: 'dev-agent-key-change-in-production',
  localPort: 7823,
};

export function loadConfig(): AgentConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Use defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AgentConfig>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}
```

- [ ] **Step 2: Implement telemetry streamer**

`packages/agent/src/telemetry-streamer.ts`:
```typescript
import WebSocket from 'ws';
import type { TokenEvent } from '@pulse/shared';

export class TelemetryStreamer {
  private ws: WebSocket | null = null;
  private buffer: unknown[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  constructor(private apiUrl: string, private apiKey: string) {}

  connect(): void {
    try {
      this.ws = new WebSocket(`${this.apiUrl}?role=agent`, {
        headers: { 'x-api-key': this.apiKey },
      });

      this.ws.on('open', () => {
        console.log('Connected to Pulse API');
        this.reconnectDelay = 1000;
        this.flushBuffer();
      });

      this.ws.on('close', () => {
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  send(type: string, data: unknown): void {
    const message = { type, data };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.buffer.push(message);
      // Cap buffer at 1000 events
      if (this.buffer.length > 1000) this.buffer.shift();
    }
  }

  sendTokenEvent(event: TokenEvent): void {
    this.send('token_event', event);
  }

  sendSessionStart(data: { id: string; tool: string; projectSlug: string; sessionType: string; model: string }): void {
    this.send('session_start', data);
  }

  sendSessionEnd(sessionId: string): void {
    this.send('session_end', { sessionId });
  }

  private flushBuffer(): void {
    while (this.buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buffer.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 3: Implement local REST server**

`packages/agent/src/local-server.ts`:
```typescript
import express from 'express';
import type { SessionTracker } from './session-tracker.js';

export function createLocalServer(tracker: SessionTracker, port: number) {
  const app = express();

  app.get('/status', (_req, res) => {
    const sessions = tracker.getActiveSessions();
    res.json({
      status: 'running',
      activeSessions: sessions.length,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/sessions/active', (_req, res) => {
    res.json(tracker.getActiveSessions());
  });

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Pulse agent local API at http://127.0.0.1:${port}`);
  });

  return server;
}
```

- [ ] **Step 4: Implement CLI entry point**

`packages/agent/src/index.ts`:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { ClaudeCodeReader } from './claude-reader.js';
import { SessionTracker } from './session-tracker.js';
import { TelemetryStreamer } from './telemetry-streamer.js';
import { createLocalServer } from './local-server.js';
import { loadConfig } from './config.js';

const program = new Command();

program
  .name('pulse-agent')
  .description('Pulse AI Dev Health Monitor — local agent')
  .version('0.1.0');

program
  .command('start')
  .description('Start monitoring Claude Code sessions')
  .option('--api-url <url>', 'Pulse API WebSocket URL')
  .option('--api-key <key>', 'Pulse API key')
  .option('--port <number>', 'Local REST API port', '7823')
  .action(async (opts) => {
    const config = loadConfig();
    const apiUrl = opts.apiUrl || config.apiUrl;
    const apiKey = opts.apiKey || config.apiKey;
    const port = parseInt(opts.port) || config.localPort;

    console.log('Starting Pulse agent...');

    const tracker = new SessionTracker();
    const streamer = new TelemetryStreamer(apiUrl, apiKey);
    const reader = new ClaudeCodeReader();

    // Connect to API server
    streamer.connect();

    // Start local REST server
    const localServer = createLocalServer(tracker, port);

    // Track known sessions to detect new ones
    const knownSessions = new Set<string>();

    // Process Claude Code messages
    reader.on('message', (msg) => {
      // Detect new sessions
      if (!knownSessions.has(msg.sessionId)) {
        knownSessions.add(msg.sessionId);
        const session = tracker.processMessage(msg);
        if (session) {
          streamer.sendSessionStart({
            id: msg.sessionId,
            tool: 'claude_code',
            projectSlug: session.projectSlug,
            sessionType: session.sessionType,
            model: msg.model,
          });
        }
      }

      const event = tracker.processMessage(msg);
      if (event) {
        streamer.sendTokenEvent(event);
        // Log to console for visibility
        const session = tracker.getSession(msg.sessionId);
        if (session) {
          process.stdout.write(
            `\r[${session.projectSlug}] ${session.sessionType} | ` +
            `$${session.cumulativeCostUsd.toFixed(4)} | ` +
            `${(event.burnRatePerMin).toFixed(0)} tok/min`
          );
        }
      }
    });

    // Start watching
    reader.start();

    console.log('Pulse agent running. Press Ctrl+C to stop.');

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nStopping Pulse agent...');
      reader.stop();
      streamer.disconnect();
      localServer.close();
      process.exit(0);
    });
  });

program
  .command('status')
  .description('Check agent status')
  .option('--port <number>', 'Local REST API port', '7823')
  .action(async (opts) => {
    const port = opts.port || 7823;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/status`);
      const data = await res.json();
      console.log('Agent status:', JSON.stringify(data, null, 2));
    } catch {
      console.log('Agent is not running.');
    }
  });

program.parse();
```

- [ ] **Step 5: Verify agent builds**

```bash
pnpm --filter @pulse/shared build && pnpm --filter @pulse/agent build
```
Expected: builds succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/
git commit -m "feat(agent): add telemetry streamer, local server, and CLI entry point"
```

---

### Task 8: @pulse/web — Next.js Dashboard Setup and Layout

**Files:**
- Modify: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/components/layout/header.tsx`
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/hooks/use-websocket.ts`
- Create: `packages/web/src/hooks/use-sessions.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
cd C:/Users/Itamar/MyProjects/pulse/packages/web
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add card badge button table tabs separator progress
```

- [ ] **Step 2: Create API client**

`packages/web/src/lib/api.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dev-token',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
```

- [ ] **Step 3: Create WebSocket hook**

`packages/web/src/hooks/use-websocket.ts`:
```typescript
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

interface WsMessage {
  type: string;
  data: unknown;
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}?role=dashboard`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

- [ ] **Step 4: Create sessions data hook**

`packages/web/src/hooks/use-sessions.ts`:
```typescript
'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';

export function useLiveSummary() {
  return useSWR('/api/dashboard/live-summary', fetchApi, {
    refreshInterval: 5000,
  });
}

export function useSessionHistory(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return useSWR(`/api/sessions/history${query}`, fetchApi, {
    refreshInterval: 10000,
  });
}

export function useSessionDetail(id: string) {
  return useSWR(id ? `/api/sessions/${id}` : null, fetchApi);
}
```

- [ ] **Step 5: Create sidebar and header**

`packages/web/src/components/layout/sidebar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '~' },
  { href: '/live', label: 'Live View', icon: '>' },
  { href: '/sessions', label: 'Sessions', icon: '#' },
  { href: '/settings', label: 'Settings', icon: '*' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-muted/40 p-4 flex flex-col gap-1">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Pulse</h1>
        <p className="text-xs text-muted-foreground">AI Dev Health Monitor</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
              pathname === item.href && 'bg-accent font-medium'
            )}
          >
            <span className="font-mono text-xs w-4">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

`packages/web/src/components/layout/header.tsx`:
```tsx
'use client';

import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected }: HeaderProps) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6">
      <div />
      <Badge variant={connected ? 'default' : 'secondary'}>
        {connected ? 'Live' : 'Disconnected'}
      </Badge>
    </header>
  );
}
```

- [ ] **Step 6: Update root layout**

`packages/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pulse — AI Dev Health Monitor',
  description: 'Real-time token consumption monitoring for AI coding tools',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Commit layout**

```bash
git add packages/web/
git commit -m "feat(web): add dashboard layout, sidebar, API client, WebSocket hook"
```

---

### Task 9: @pulse/web — Live View Page

**Files:**
- Create: `packages/web/src/app/live/page.tsx`
- Create: `packages/web/src/components/live/active-session-panel.tsx`
- Create: `packages/web/src/components/live/token-gauge.tsx`
- Create: `packages/web/src/components/live/burn-rate.tsx`
- Create: `packages/web/src/components/live/cost-meter.tsx`
- Create: `packages/web/src/components/live/today-summary.tsx`

- [ ] **Step 1: Create token gauge component**

`packages/web/src/components/live/token-gauge.tsx`:
```tsx
'use client';

interface TokenGaugeProps {
  used: number;
  limit: number;
}

export function TokenGauge({ used, limit }: TokenGaugeProps) {
  const percentage = Math.min((used / limit) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const color = percentage > 90 ? '#ef4444' : percentage > 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{percentage.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground">
          {(used / 1000).toFixed(0)}k / {(limit / 1000).toFixed(0)}k
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create burn rate and cost meter components**

`packages/web/src/components/live/burn-rate.tsx`:
```tsx
interface BurnRateProps {
  current: number;
  average: number;
}

export function BurnRate({ current, average }: BurnRateProps) {
  const ratio = average > 0 ? current / average : 0;
  const color = ratio > 2 ? 'text-red-500' : ratio > 1.5 ? 'text-amber-500' : 'text-green-500';

  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">Burn Rate</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>
        {current.toFixed(0)}
      </p>
      <p className="text-xs text-muted-foreground">tok/min</p>
      {average > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          avg: {average.toFixed(0)} tok/min
        </p>
      )}
    </div>
  );
}
```

`packages/web/src/components/live/cost-meter.tsx`:
```tsx
interface CostMeterProps {
  cost: number;
}

export function CostMeter({ cost }: CostMeterProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">Session Cost</p>
      <p className="text-3xl font-bold font-mono text-foreground">
        ${cost.toFixed(4)}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create active session panel**

`packages/web/src/components/live/active-session-panel.tsx`:
```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TokenGauge } from './token-gauge';
import { BurnRate } from './burn-rate';
import { CostMeter } from './cost-meter';

interface ActiveSessionProps {
  session: {
    sessionId: string;
    tool: string;
    sessionType: string;
    model: string;
    projectSlug: string;
    cumulativeInputTokens: number;
    cumulativeOutputTokens: number;
    cumulativeCostUsd: number;
    burnRatePerMin: number;
  } | null;
}

const SESSION_TOKEN_LIMIT = 200_000; // Approximate context window

export function ActiveSessionPanel({ session }: ActiveSessionProps) {
  if (!session) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No active session detected. Start a Claude Code session to see live data.
        </CardContent>
      </Card>
    );
  }

  const totalTokens = session.cumulativeInputTokens + session.cumulativeOutputTokens;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Active Session</CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline">{session.tool.replace('_', ' ')}</Badge>
          <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
            {session.sessionType}
          </Badge>
          <Badge variant="outline">{session.model}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Project: <span className="font-mono">{session.projectSlug}</span>
        </p>
        <div className="grid grid-cols-3 gap-6 items-center">
          <TokenGauge used={totalTokens} limit={SESSION_TOKEN_LIMIT} />
          <BurnRate current={session.burnRatePerMin} average={0} />
          <CostMeter cost={session.cumulativeCostUsd} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create today's summary strip**

`packages/web/src/components/live/today-summary.tsx`:
```tsx
import { Card, CardContent } from '@/components/ui/card';

interface TodaySummaryProps {
  totalCost: number;
  humanCost: number;
  agentCost: number;
  humanSessions: number;
  agentSessions: number;
}

export function TodaySummary({ totalCost, humanCost, agentCost, humanSessions, agentSessions }: TodaySummaryProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total Spend Today</p>
          <p className="text-2xl font-bold font-mono">${totalCost.toFixed(2)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Human Sessions</p>
          <p className="text-2xl font-bold font-mono">${humanCost.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{humanSessions} sessions</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Agent Runs</p>
          <p className="text-2xl font-bold font-mono">${agentCost.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{agentSessions} runs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Cost Tracked</p>
          <p className="text-2xl font-bold font-mono text-green-500">
            ${totalCost.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground">cumulative</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create Live View page**

`packages/web/src/app/live/page.tsx`:
```tsx
'use client';

import { useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { Header } from '@/components/layout/header';
import { ActiveSessionPanel } from '@/components/live/active-session-panel';
import { TodaySummary } from '@/components/live/today-summary';

interface LiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
}

export default function LivePage() {
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const { data: summary } = useLiveSummary();

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession;
      setActiveSession(event);
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Live View</h2>

        <ActiveSessionPanel session={activeSession} />

        <TodaySummary
          totalCost={summary?.totalCostToday ?? 0}
          humanCost={summary?.humanCostToday ?? 0}
          agentCost={summary?.agentCostToday ?? 0}
          humanSessions={summary?.humanSessionsToday ?? 0}
          agentSessions={summary?.agentSessionsToday ?? 0}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit Live View**

```bash
git add packages/web/src/
git commit -m "feat(web): add Live View page with token gauge, burn rate, and cost meter"
```

---

### Task 10: @pulse/web — Dashboard Home and Session History Pages

**Files:**
- Modify: `packages/web/src/app/page.tsx`
- Create: `packages/web/src/app/sessions/page.tsx`
- Create: `packages/web/src/app/sessions/[id]/page.tsx`
- Create: `packages/web/src/app/settings/page.tsx`
- Create: `packages/web/src/components/sessions/session-table.tsx`
- Create: `packages/web/src/components/sessions/session-detail.tsx`

- [ ] **Step 1: Create session table component**

`packages/web/src/components/sessions/session-table.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Session {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface SessionTableProps {
  sessions: Session[];
}

export function SessionTable({ sessions }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No sessions recorded yet. Start using Claude Code with the Pulse agent running.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const duration = session.endedAt
            ? formatDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())
            : 'Active';
          const totalTokens = session.inputTokens + session.outputTokens;

          return (
            <TableRow key={session.id}>
              <TableCell>
                <Link href={`/sessions/${session.id}`} className="font-mono text-sm hover:underline">
                  {session.projectSlug}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
                  {session.sessionType}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{session.model}</TableCell>
              <TableCell className="text-sm">
                {new Date(session.startedAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm">{duration}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {(totalTokens / 1000).toFixed(1)}k
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                ${session.costUsd.toFixed(4)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
```

- [ ] **Step 2: Create session detail component**

`packages/web/src/components/sessions/session-detail.tsx`:
```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TokenEvent {
  timestamp: string;
  cumulativeCostUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  burnRatePerMin: number;
}

interface SessionDetailProps {
  session: {
    id: string;
    tool: string;
    projectSlug: string;
    sessionType: string;
    model: string;
    startedAt: string;
    endedAt: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    tokenEvents: TokenEvent[];
  };
}

export function SessionDetail({ session }: SessionDetailProps) {
  const chartData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString(),
    cost: e.cumulativeCostUsd,
    tokens: e.cumulativeInputTokens + e.cumulativeOutputTokens,
    burnRate: e.burnRatePerMin,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold font-mono">{session.projectSlug}</h2>
        <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
          {session.sessionType}
        </Badge>
        <Badge variant="outline">{session.model}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-xl font-bold font-mono">${session.costUsd.toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Input Tokens</p>
            <p className="text-xl font-bold font-mono">{(session.inputTokens / 1000).toFixed(1)}k</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Output Tokens</p>
            <p className="text-xl font-bold font-mono">{(session.outputTokens / 1000).toFixed(1)}k</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cache Tokens</p>
            <p className="text-xl font-bold font-mono">
              {((session.cacheCreationTokens + session.cacheReadTokens) / 1000).toFixed(1)}k
            </p>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(value: number) => `$${value.toFixed(4)}`} />
                <Line type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create dashboard home page**

`packages/web/src/app/page.tsx`:
```tsx
'use client';

import { Header } from '@/components/layout/header';
import { TodaySummary } from '@/components/live/today-summary';
import { SessionTable } from '@/components/sessions/session-table';
import { useLiveSummary, useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DashboardHome() {
  const { connected } = useWebSocket(() => {});
  const { data: summary } = useLiveSummary();
  const { data: historyData } = useSessionHistory({ limit: '5' });

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>

        <TodaySummary
          totalCost={summary?.totalCostToday ?? 0}
          humanCost={summary?.humanCostToday ?? 0}
          agentCost={summary?.agentCostToday ?? 0}
          humanSessions={summary?.humanSessionsToday ?? 0}
          agentSessions={summary?.agentSessionsToday ?? 0}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Sessions</CardTitle>
            <Link href="/sessions" className="text-sm text-muted-foreground hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <SessionTable sessions={historyData?.sessions ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create sessions history page**

`packages/web/src/app/sessions/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { SessionTable } from '@/components/sessions/session-table';
import { useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import { Button } from '@/components/ui/button';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const { connected } = useWebSocket(() => {});
  const { data } = useSessionHistory({ page: String(page), limit: '20' });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Session History</h2>

        <SessionTable sessions={data?.sessions ?? []} />

        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground py-2">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create session detail page**

`packages/web/src/app/sessions/[id]/page.tsx`:
```tsx
'use client';

import { use } from 'react';
import { Header } from '@/components/layout/header';
import { SessionDetail } from '@/components/sessions/session-detail';
import { useSessionDetail } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import Link from 'next/link';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected } = useWebSocket(() => {});
  const { data: session, isLoading } = useSessionDetail(id);

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <Link href="/sessions" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to sessions
        </Link>
        {isLoading && <p>Loading...</p>}
        {session && <SessionDetail session={session} />}
        {!isLoading && !session && <p>Session not found.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create settings page**

`packages/web/src/app/settings/page.tsx`:
```tsx
'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SettingsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Settings</h2>

        <Card>
          <CardHeader>
            <CardTitle>Agent Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">API Server</span>
              <Badge variant={connected ? 'default' : 'secondary'}>
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">WebSocket URL</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monitored Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Claude Code</span>
              <Badge>Active</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Cursor</span>
              <Badge variant="outline">Coming in Phase 5</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Windsurf</span>
              <Badge variant="outline">Coming in Phase 5</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit pages**

```bash
git add packages/web/src/
git commit -m "feat(web): add dashboard home, session history, session detail, and settings pages"
```

---

### Task 11: Docker, README, and Final Integration

**Files:**
- Create: `README.md`
- Modify: `docker-compose.yml` (already created)
- Create: `turbo.json`

- [ ] **Step 1: Create Turbo config**

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 2: Create README**

`README.md`:
```markdown
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

## Tech Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Agent:** Node.js, chokidar, WebSocket client
- **API:** Express, Prisma, PostgreSQL, Redis, WebSocket
- **Dashboard:** Next.js 14, Tailwind CSS, shadcn/ui, Recharts
- **Testing:** Vitest

## License

MIT
```

- [ ] **Step 3: Add .env to web package**

`packages/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

- [ ] **Step 4: Verify full build**

```bash
cd C:/Users/Itamar/MyProjects/pulse
pnpm --filter @pulse/shared build
pnpm --filter @pulse/agent build
pnpm --filter @pulse/api build
pnpm --filter @pulse/web build
```

- [ ] **Step 5: Commit and push to GitHub**

```bash
git add -A
git commit -m "feat: add README, Turbo config, and env files"
```

Create GitHub repo and push:
```bash
gh repo create pulse --public --source=. --remote=origin --push
```

- [ ] **Step 6: Verify repo on GitHub**

```bash
gh repo view --web
```
