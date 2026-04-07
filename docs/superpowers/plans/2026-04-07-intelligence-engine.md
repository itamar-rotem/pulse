# Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered governance rules, anomaly detection, optimization insights, and webhook-based alerts to Pulse.

**Architecture:** Six new services in `packages/api/src/services/intelligence/` (RuleEngine, AnomalyDetector, InsightGenerator, AlertManager, WebhookService, Scheduler) with 4 new Prisma models (Rule, Alert, Insight, Webhook), 20+ REST endpoints, WebSocket integration for real-time alerts and session pause/resume, and dashboard UI updates for the Insights/Alerts/Rules pages.

**Tech Stack:** Prisma 6 (PostgreSQL), Express 5, ioredis, ws, node-cron, Vitest, Next.js 16, SWR, Recharts, Tailwind CSS v4, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-07-pulse-intelligence-engine.md`

---

## File Map

### New Files

```
packages/shared/src/intelligence-types.ts          — All intelligence type definitions (Rule, Alert, Insight, Webhook, enums)
packages/api/prisma/schema.prisma                   — MODIFY: Add 4 new models + enums + Session status field
packages/api/src/services/intelligence/
  alert-manager.ts                                  — Central alert hub: persist, broadcast, dispatch webhooks
  webhook-service.ts                                — HTTP delivery to external endpoints with retry + circuit breaker
  rule-engine.ts                                    — Real-time rule evaluation against token events
  anomaly-detector.ts                               — Real-time anomaly detection (burn rate spikes, generation loops)
  insight-generator.ts                              — Batch trend analysis + recommendations (every 5 min)
  scheduler.ts                                      — Periodic job runner (setInterval + node-cron)
packages/api/src/routes/
  rules.ts                                          — Rules CRUD endpoints
  alerts.ts                                         — Alerts list/read/dismiss/batch endpoints
  insights.ts                                       — Insights list/dismiss/apply endpoints
  webhooks.ts                                       — Webhooks CRUD + test endpoints
packages/api/tests/
  alert-manager.test.ts                             — AlertManager unit tests
  webhook-service.test.ts                           — WebhookService unit tests
  rule-engine.test.ts                               — RuleEngine unit tests
  anomaly-detector.test.ts                          — AnomalyDetector unit tests
  insight-generator.test.ts                         — InsightGenerator unit tests
packages/web/src/hooks/
  use-intelligence.ts                               — SWR hooks for alerts, insights, rules, webhooks
packages/web/src/app/alerts/page.tsx                — REWRITE: Real alert feed replacing ComingSoon
packages/web/src/app/insights/page.tsx              — REWRITE: Insight cards replacing ComingSoon
packages/web/src/app/rules/page.tsx                 — REWRITE: Rule management replacing ComingSoon
```

### Modified Files

```
packages/api/prisma/schema.prisma                   — Add Rule, Alert, Insight, Webhook models + Session.status
packages/shared/src/types.ts                        — Add SessionStatus type
packages/shared/src/index.ts                        — Re-export intelligence-types
packages/api/src/app.ts                             — Register new route modules
packages/api/src/index.ts                           — Start scheduler, subscribe to pulse:alerts
packages/api/src/ws-server.ts                       — Session registry, alert broadcast, intelligence integration
packages/api/src/services/redis.ts                  — Add publishAlert function + pulse:alerts channel
packages/api/src/services/session-service.ts        — Add pause/resume functions
packages/api/src/routes/sessions.ts                 — Add pause/resume endpoints
packages/agent/src/telemetry-streamer.ts            — Add message listener for pause/resume
packages/agent/src/session-tracker.ts               — Add pause/resume status tracking
packages/web/src/components/layout/sidebar.tsx       — Dynamic alert badge from SWR
packages/web/src/app/page.tsx                       — Replace mock InsightCard with real data
packages/web/src/app/settings/page.tsx              — Add Webhooks section
packages/web/src/hooks/use-websocket.ts             — Handle alert notifications
```

---

## Task 1: Database Schema + Shared Types

**Files:**
- Modify: `packages/api/prisma/schema.prisma`
- Create: `packages/shared/src/intelligence-types.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add intelligence types to shared package**

Create `packages/shared/src/intelligence-types.ts`:

```typescript
// Intelligence Engine types — shared between API and Web

// ── Enums ──────────────────────────────────────────

export type RuleType =
  | 'COST_CAP_SESSION'
  | 'COST_CAP_DAILY'
  | 'COST_CAP_PROJECT'
  | 'MODEL_RESTRICTION'
  | 'BURN_RATE_LIMIT'
  | 'SESSION_DURATION';

export type RuleAction = 'ALERT' | 'PAUSE' | 'BLOCK';

export type AlertType = 'RULE_BREACH' | 'ANOMALY' | 'INSIGHT' | 'SYSTEM';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertStatus = 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED';

export type InsightCategory =
  | 'COST_OPTIMIZATION'
  | 'USAGE_PATTERN'
  | 'ANOMALY_TREND'
  | 'PLAN_RECOMMENDATION';

export type InsightStatus = 'ACTIVE' | 'DISMISSED' | 'APPLIED';

export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

// ── Interfaces ─────────────────────────────────────

export interface RuleScope {
  projectName?: string;
  sessionType?: string;
  global?: boolean;
}

export interface RuleCondition {
  maxCost?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  allowedModels?: string[];
  maxRate?: number;
  maxMinutes?: number;
}

export interface InsightImpact {
  estimatedSavings?: number;
  confidence?: number;
  percentChange?: number;
}

export interface Rule {
  id: string;
  name: string;
  type: RuleType;
  scope: RuleScope;
  condition: RuleCondition;
  action: RuleAction;
  enabled: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  status: AlertStatus;
  sessionId: string | null;
  ruleId: string | null;
  insightId: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  impact: InsightImpact;
  metadata: Record<string, unknown>;
  status: InsightStatus;
  createdAt: string;
  dismissedAt: string | null;
  appliedAt: string | null;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: AlertType[];
  enabled: boolean;
  failCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  lastSentAt: string | null;
}

// ── WebSocket Messages ─────────────────────────────

export interface SessionPauseMessage {
  type: 'session_pause';
  sessionId: string;
  reason: string;
  ruleId?: string;
}

export interface SessionResumeMessage {
  type: 'session_resume';
  sessionId: string;
}

export interface AlertNotification {
  type: 'alert';
  alert: Alert;
}

// ── Service Input Types ────────────────────────────

export interface CreateAlertInput {
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  ruleId?: string;
  insightId?: string;
}

export interface AlertFilters {
  status?: AlertStatus;
  severity?: Severity;
  type?: AlertType;
  since?: string;
  page?: number;
  limit?: number;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  action: RuleAction;
  severity: Severity;
  message: string;
  sessionId: string;
}

export interface Anomaly {
  type: string;
  severity: Severity;
  title: string;
  message: string;
  sessionId: string;
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 2: Add SessionStatus to existing types.ts**

In `packages/shared/src/types.ts`, add after the `Session` interface (after line 35):

```typescript
export type { SessionStatus } from './intelligence-types.js';
```

- [ ] **Step 3: Re-export intelligence types from shared index**

In `packages/shared/src/index.ts`, add a new export line:

```typescript
export * from './intelligence-types.js';
```

- [ ] **Step 4: Update Prisma schema with new models**

Replace the entire contents of `packages/api/prisma/schema.prisma` with:

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
  tool                String
  projectSlug         String        @map("project_slug")
  sessionType         String        @map("session_type")
  model               String
  status              SessionStatus @default(ACTIVE)
  startedAt           DateTime      @default(now()) @map("started_at")
  endedAt             DateTime?     @map("ended_at")
  inputTokens         Int           @default(0) @map("input_tokens")
  outputTokens        Int           @default(0) @map("output_tokens")
  cacheCreationTokens Int           @default(0) @map("cache_creation_tokens")
  cacheReadTokens     Int           @default(0) @map("cache_read_tokens")
  costUsd             Float         @default(0) @map("cost_usd")
  tokenEvents         TokenEvent[]
  alerts              Alert[]

  @@map("sessions")
}

enum SessionStatus {
  ACTIVE
  PAUSED
  ENDED
}

model TokenEvent {
  id                     String   @id @default(uuid())
  sessionId              String   @map("session_id")
  timestamp              DateTime @default(now())
  tool                   String
  model                  String
  projectSlug            String   @map("project_slug")
  sessionType            String   @map("session_type")
  inputTokens            Int      @map("input_tokens")
  outputTokens           Int      @map("output_tokens")
  cacheCreationTokens    Int      @default(0) @map("cache_creation_tokens")
  cacheReadTokens        Int      @default(0) @map("cache_read_tokens")
  costDeltaUsd           Float    @map("cost_delta_usd")
  cumulativeInputTokens  Int      @map("cumulative_input_tokens")
  cumulativeOutputTokens Int      @map("cumulative_output_tokens")
  cumulativeCostUsd      Float    @map("cumulative_cost_usd")
  burnRatePerMin         Float    @map("burn_rate_per_min")

  session                Session  @relation(fields: [sessionId], references: [id])

  @@index([sessionId])
  @@index([timestamp])
  @@map("token_events")
}

model Rule {
  id              String     @id @default(uuid())
  name            String
  type            RuleType
  scope           Json
  condition       Json
  action          RuleAction
  enabled         Boolean    @default(true)
  lastTriggeredAt DateTime?  @map("last_triggered_at")
  triggerCount    Int        @default(0) @map("trigger_count")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")
  alerts          Alert[]

  @@map("rules")
}

enum RuleType {
  COST_CAP_SESSION
  COST_CAP_DAILY
  COST_CAP_PROJECT
  MODEL_RESTRICTION
  BURN_RATE_LIMIT
  SESSION_DURATION
}

enum RuleAction {
  ALERT
  PAUSE
  BLOCK
}

model Alert {
  id          String      @id @default(uuid())
  type        AlertType
  severity    Severity
  title       String
  message     String
  metadata    Json        @default("{}")
  status      AlertStatus @default(ACTIVE)
  sessionId   String?     @map("session_id")
  session     Session?    @relation(fields: [sessionId], references: [id])
  ruleId      String?     @map("rule_id")
  rule        Rule?       @relation(fields: [ruleId], references: [id])
  insightId   String?     @map("insight_id")
  insight     Insight?    @relation(fields: [insightId], references: [id])
  createdAt   DateTime    @default(now()) @map("created_at")
  readAt      DateTime?   @map("read_at")
  dismissedAt DateTime?   @map("dismissed_at")

  @@index([status])
  @@index([type])
  @@index([createdAt])
  @@map("alerts")
}

enum AlertType {
  RULE_BREACH
  ANOMALY
  INSIGHT
  SYSTEM
}

enum Severity {
  INFO
  WARNING
  CRITICAL
}

enum AlertStatus {
  ACTIVE
  READ
  DISMISSED
  RESOLVED
}

model Insight {
  id          String          @id @default(uuid())
  category    InsightCategory
  title       String
  description String
  impact      Json            @default("{}")
  metadata    Json            @default("{}")
  dedupKey    String          @unique @map("dedup_key")
  status      InsightStatus   @default(ACTIVE)
  alerts      Alert[]
  createdAt   DateTime        @default(now()) @map("created_at")
  dismissedAt DateTime?       @map("dismissed_at")
  appliedAt   DateTime?       @map("applied_at")

  @@index([status])
  @@index([category])
  @@map("insights")
}

enum InsightCategory {
  COST_OPTIMIZATION
  USAGE_PATTERN
  ANOMALY_TREND
  PLAN_RECOMMENDATION
}

enum InsightStatus {
  ACTIVE
  DISMISSED
  APPLIED
}

model Webhook {
  id         String   @id @default(uuid())
  name       String
  url        String
  secret     String?
  events     String[]
  enabled    Boolean  @default(true)
  failCount  Int      @default(0) @map("fail_count")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  lastError  String?  @map("last_error")
  lastSentAt DateTime? @map("last_sent_at")

  @@map("webhooks")
}
```

- [ ] **Step 5: Run Prisma db push**

Run: `cd packages/api && npx prisma db push`
Expected: Schema synced, no errors

- [ ] **Step 6: Regenerate Prisma client**

Run: `cd packages/api && npx prisma generate`
Expected: Client generated successfully

- [ ] **Step 7: Build shared package**

Run: `cd packages/shared && pnpm build`
Expected: Build succeeds, `dist/intelligence-types.js` exists

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/intelligence-types.ts packages/shared/src/types.ts packages/shared/src/index.ts packages/api/prisma/schema.prisma
git commit -m "feat: add intelligence engine schema + shared types

Add Rule, Alert, Insight, Webhook Prisma models with enums.
Add SessionStatus to Session model. Add shared TypeScript
types for all intelligence domain objects."
```

---

## Task 2: Redis + AlertManager + WebhookService

**Files:**
- Modify: `packages/api/src/services/redis.ts`
- Create: `packages/api/src/services/intelligence/alert-manager.ts`
- Create: `packages/api/src/services/intelligence/webhook-service.ts`
- Create: `packages/api/tests/alert-manager.test.ts`
- Create: `packages/api/tests/webhook-service.test.ts`

- [ ] **Step 1: Write AlertManager tests**

Create `packages/api/tests/alert-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  alert: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  rule: {
    update: vi.fn(),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// Mock redis
vi.mock('../src/services/redis.js', () => ({
  publishAlert: vi.fn(),
}));

// Mock webhook service
vi.mock('../src/services/intelligence/webhook-service.js', () => ({
  webhookService: { dispatch: vi.fn() },
}));

import { alertManager } from '../src/services/intelligence/alert-manager.js';

describe('AlertManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('persists alert and returns it', async () => {
      const mockAlert = {
        id: 'alert-1',
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Burn rate spike',
        message: 'Session xyz burn rate 5x above baseline',
        metadata: {},
        status: 'ACTIVE',
        sessionId: 'session-1',
        ruleId: null,
        insightId: null,
        createdAt: new Date(),
        readAt: null,
        dismissedAt: null,
      };
      mockPrisma.alert.create.mockResolvedValue(mockAlert);

      const result = await alertManager.create({
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Burn rate spike',
        message: 'Session xyz burn rate 5x above baseline',
        sessionId: 'session-1',
      });

      expect(result.id).toBe('alert-1');
      expect(mockPrisma.alert.create).toHaveBeenCalledOnce();
    });

    it('updates rule triggerCount when ruleId is provided', async () => {
      mockPrisma.alert.create.mockResolvedValue({
        id: 'alert-2',
        type: 'RULE_BREACH',
        severity: 'CRITICAL',
        ruleId: 'rule-1',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
      mockPrisma.rule.update.mockResolvedValue({});

      await alertManager.create({
        type: 'RULE_BREACH',
        severity: 'CRITICAL',
        title: 'Cost cap exceeded',
        message: 'Over $50',
        ruleId: 'rule-1',
      });

      expect(mockPrisma.rule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { triggerCount: { increment: 1 }, lastTriggeredAt: expect.any(Date) },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('counts ACTIVE alerts', async () => {
      mockPrisma.alert.count.mockResolvedValue(5);

      const count = await alertManager.getUnreadCount();

      expect(count).toBe(5);
      expect(mockPrisma.alert.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
    });
  });

  describe('markRead', () => {
    it('sets status to READ and readAt timestamp', async () => {
      mockPrisma.alert.update.mockResolvedValue({});

      await alertManager.markRead('alert-1');

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { status: 'READ', readAt: expect.any(Date) },
      });
    });
  });

  describe('dismiss', () => {
    it('sets status to DISMISSED and dismissedAt timestamp', async () => {
      mockPrisma.alert.update.mockResolvedValue({});

      await alertManager.dismiss('alert-1');

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { status: 'DISMISSED', dismissedAt: expect.any(Date) },
      });
    });
  });

  describe('batchMarkRead', () => {
    it('updates multiple alerts at once', async () => {
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 3 });

      await alertManager.batchMarkRead(['a1', 'a2', 'a3']);

      expect(mockPrisma.alert.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2', 'a3'] } },
        data: { status: 'READ', readAt: expect.any(Date) },
      });
    });
  });

  describe('getAlerts', () => {
    it('applies filters and pagination', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(0);

      await alertManager.getAlerts({ status: 'ACTIVE', severity: 'CRITICAL', page: 2, limit: 10 });

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', severity: 'CRITICAL' },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });
  });
});
```

- [ ] **Step 2: Write WebhookService tests**

Create `packages/api/tests/webhook-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  webhook: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { webhookService } from '../src/services/intelligence/webhook-service.js';

describe('WebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dispatch', () => {
    it('sends to matching webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await webhookService.dispatch({
        id: 'alert-1',
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Spike',
        message: 'Burn rate spike',
        metadata: {},
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      } as any);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('skips disabled webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      await webhookService.dispatch({ type: 'ANOMALY' } as any);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('increments failCount on delivery failure', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await webhookService.dispatch({ id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString() } as any);

      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ failCount: { increment: 1 } }),
      });
    });

    it('auto-disables webhook after 5 consecutive failures', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 4 },
      ]);
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await webhookService.dispatch({ id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString() } as any);

      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ enabled: false }),
      });
    });
  });

  describe('test', () => {
    it('sends test payload and returns success', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', url: 'https://hooks.example.com/test', secret: null,
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await webhookService.test('wh-1');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('returns failure info on error', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', url: 'https://hooks.example.com/test', secret: null,
      });
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const result = await webhookService.test('wh-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DNS resolution failed');
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run tests/alert-manager.test.ts tests/webhook-service.test.ts 2>&1 | head -30`
Expected: FAIL — modules not found

- [ ] **Step 4: Add publishAlert to Redis service**

In `packages/api/src/services/redis.ts`, add after the `publishSessionUpdate` function (after line 32):

```typescript
export async function publishAlert(alert: unknown): Promise<void> {
  try {
    await redis.publish('pulse:alerts', JSON.stringify(alert));
  } catch {
    // Redis not available
  }
}
```

- [ ] **Step 5: Implement WebhookService**

Create `packages/api/src/services/intelligence/webhook-service.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import type { Alert } from '@pulse/shared';

const prisma = new PrismaClient();

const MAX_FAIL_COUNT = 5;

class WebhookService {
  async dispatch(alert: Alert): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        enabled: true,
        events: { has: alert.type },
      },
    });

    await Promise.allSettled(
      webhooks.map((wh) => this.deliver(wh, alert)),
    );
  }

  private async deliver(
    webhook: { id: string; url: string; secret: string | null; failCount: number },
    alert: Alert,
  ): Promise<void> {
    const payload = JSON.stringify({
      event: alert.type,
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metadata: alert.metadata,
      },
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
      headers['X-Pulse-Signature'] = signature;
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastSentAt: new Date(), failCount: 0, lastError: null },
      });
    } catch (err) {
      const newFailCount = webhook.failCount + 1;
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          failCount: { increment: 1 },
          lastError: (err as Error).message,
          ...(newFailCount >= MAX_FAIL_COUNT ? { enabled: false } : {}),
        },
      });
    }
  }

  async test(webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) return { success: false, error: 'Webhook not found' };

    const payload = JSON.stringify({
      event: 'TEST',
      alert: {
        id: 'test',
        type: 'SYSTEM',
        severity: 'INFO',
        title: 'Webhook test',
        message: 'This is a test payload from Pulse',
        metadata: {},
      },
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhook.secret) {
      headers['X-Pulse-Signature'] = createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      return { success: res.ok, statusCode: res.status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const webhookService = new WebhookService();
```

- [ ] **Step 6: Implement AlertManager**

Create `packages/api/src/services/intelligence/alert-manager.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { publishAlert } from '../redis.js';
import { webhookService } from './webhook-service.js';
import type { CreateAlertInput, AlertFilters, Alert } from '@pulse/shared';

const prisma = new PrismaClient();

class AlertManager {
  async create(input: CreateAlertInput): Promise<Alert> {
    const alert = await prisma.alert.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        metadata: input.metadata ?? {},
        sessionId: input.sessionId ?? null,
        ruleId: input.ruleId ?? null,
        insightId: input.insightId ?? null,
      },
    });

    // Update rule trigger stats if this is a rule breach
    if (input.ruleId) {
      await prisma.rule.update({
        where: { id: input.ruleId },
        data: {
          triggerCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      }).catch(() => {}); // non-critical
    }

    // Broadcast via Redis to dashboard WebSocket clients
    await publishAlert(alert);

    // Dispatch to webhooks (async, non-blocking)
    webhookService.dispatch(alert as unknown as Alert).catch(() => {});

    return alert as unknown as Alert;
  }

  async markRead(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async dismiss(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async resolve(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
  }

  async batchMarkRead(ids: string[]): Promise<void> {
    await prisma.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async batchDismiss(ids: string[]): Promise<void> {
    await prisma.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async getAlerts(filters: AlertFilters): Promise<{ alerts: Alert[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.type) where.type = filters.type;
    if (filters.since) where.createdAt = { gte: new Date(filters.since) };

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where }),
    ]);

    return { alerts: alerts as unknown as Alert[], total, page, limit };
  }

  async getById(id: string): Promise<Alert | null> {
    const alert = await prisma.alert.findUnique({ where: { id } });
    return alert as unknown as Alert | null;
  }

  async getUnreadCount(): Promise<number> {
    return prisma.alert.count({ where: { status: 'ACTIVE' } });
  }
}

export const alertManager = new AlertManager();
```

- [ ] **Step 7: Run tests**

Run: `cd packages/api && npx vitest run tests/alert-manager.test.ts tests/webhook-service.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/redis.ts packages/api/src/services/intelligence/ packages/api/tests/alert-manager.test.ts packages/api/tests/webhook-service.test.ts
git commit -m "feat(api): add AlertManager and WebhookService

AlertManager: create/read/dismiss/resolve alerts with Redis broadcast
and webhook dispatch. WebhookService: HTTP delivery with HMAC signing,
retry logic, and circuit breaker (auto-disable after 5 failures)."
```

---

## Task 3: RuleEngine

**Files:**
- Create: `packages/api/src/services/intelligence/rule-engine.ts`
- Create: `packages/api/tests/rule-engine.test.ts`

- [ ] **Step 1: Write RuleEngine tests**

Create `packages/api/tests/rule-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  rule: { findMany: vi.fn() },
  session: { aggregate: vi.fn() },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockRedis = { get: vi.fn(), set: vi.fn() };
vi.mock('../src/services/redis.js', () => ({
  redis: mockRedis,
}));

import { ruleEngine } from '../src/services/intelligence/rule-engine.js';

describe('RuleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ruleEngine._setRulesForTest([]);
  });

  describe('evaluate — COST_CAP_SESSION', () => {
    it('returns PAUSE violation when session cost exceeds cap', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Session cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'PAUSE', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 55, projectSlug: 'my-project', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('r1');
      expect(violations[0].action).toBe('PAUSE');
      expect(violations[0].severity).toBe('CRITICAL');
    });

    it('returns no violation when under cap', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Session cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'PAUSE', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 30, projectSlug: 'my-project', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('evaluate — MODEL_RESTRICTION', () => {
    it('returns BLOCK violation when model not in allowed list', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r2', name: 'Sonnet only', type: 'MODEL_RESTRICTION', scope: { projectName: 'beta' }, condition: { allowedModels: ['claude-sonnet-4-6'] }, action: 'BLOCK', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', model: 'claude-opus-4-6', burnRatePerMin: 500 } as any,
        { id: 's1', costUsd: 10, projectSlug: 'beta', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('BLOCK');
    });

    it('skips rule when project does not match scope', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r2', name: 'Sonnet only', type: 'MODEL_RESTRICTION', scope: { projectName: 'beta' }, condition: { allowedModels: ['claude-sonnet-4-6'] }, action: 'BLOCK', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', model: 'claude-opus-4-6', burnRatePerMin: 500 } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('evaluate — BURN_RATE_LIMIT', () => {
    it('returns ALERT on first burn rate violation', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r3', name: 'Rate limit', type: 'BURN_RATE_LIMIT', scope: { global: true }, condition: { maxRate: 10000 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 15000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 5, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('ALERT');
    });
  });

  describe('evaluate — SESSION_DURATION', () => {
    it('returns PAUSE when session exceeds max duration', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r4', name: 'Max 60 min', type: 'SESSION_DURATION', scope: { global: true }, condition: { maxMinutes: 60 }, action: 'PAUSE', enabled: true },
      ]);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 5, projectSlug: 'alpha', sessionType: 'human', startedAt: twoHoursAgo } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('PAUSE');
    });
  });

  describe('scope matching', () => {
    it('global scope matches any session', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Global cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 10 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 100, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 15, projectSlug: 'anything', sessionType: 'agent_local', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
    });

    it('sessionType scope filters correctly', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Agent cap', type: 'COST_CAP_SESSION', scope: { sessionType: 'agent_local' }, condition: { maxCost: 10 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 100, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 15, projectSlug: 'test', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run tests/rule-engine.test.ts 2>&1 | head -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RuleEngine**

Create `packages/api/src/services/intelligence/rule-engine.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { redis } from '../redis.js';
import type { RuleViolation, RuleScope, RuleCondition, Severity, RuleAction, RuleType } from '@pulse/shared';

const prisma = new PrismaClient();

interface CachedRule {
  id: string;
  name: string;
  type: RuleType;
  scope: RuleScope;
  condition: RuleCondition;
  action: RuleAction;
  enabled: boolean;
}

interface SessionContext {
  id: string;
  costUsd: number;
  projectSlug: string;
  sessionType: string;
  startedAt: Date | string;
}

interface EventContext {
  sessionId: string;
  burnRatePerMin: number;
  model: string;
}

class RuleEngine {
  private rules: CachedRule[] = [];
  private violationTimers = new Map<string, number>(); // ruleId:sessionId → timestamp ms

  /** Refresh rules from database. Called by scheduler every 60s. */
  async refreshCache(): Promise<void> {
    const dbRules = await prisma.rule.findMany({ where: { enabled: true } });
    this.rules = dbRules.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as RuleType,
      scope: r.scope as unknown as RuleScope,
      condition: r.condition as unknown as RuleCondition,
      action: r.action as RuleAction,
      enabled: r.enabled,
    }));
  }

  /** Evaluate all rules against a token event + session state. */
  async evaluate(event: EventContext, session: SessionContext): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];

    for (const rule of this.rules) {
      if (!this.matchesScope(rule.scope, session, event)) continue;

      const violation = await this.evaluateRule(rule, event, session);
      if (violation) violations.push(violation);
    }

    return violations;
  }

  private matchesScope(scope: RuleScope, session: SessionContext, _event: EventContext): boolean {
    if (scope.global) return true;
    if (scope.projectName && session.projectSlug !== scope.projectName) return false;
    if (scope.sessionType && session.sessionType !== scope.sessionType) return false;
    // If scope has specific project or session type and they match, return true
    return !!(scope.projectName || scope.sessionType);
  }

  private async evaluateRule(
    rule: CachedRule,
    event: EventContext,
    session: SessionContext,
  ): Promise<RuleViolation | null> {
    switch (rule.type) {
      case 'COST_CAP_SESSION':
        return this.checkCostCapSession(rule, session);

      case 'COST_CAP_DAILY':
        return this.checkCostCapDaily(rule);

      case 'COST_CAP_PROJECT':
        return this.checkCostCapProject(rule, session);

      case 'MODEL_RESTRICTION':
        return this.checkModelRestriction(rule, event);

      case 'BURN_RATE_LIMIT':
        return this.checkBurnRateLimit(rule, event, session);

      case 'SESSION_DURATION':
        return this.checkSessionDuration(rule, session);

      default:
        return null;
    }
  }

  private checkCostCapSession(rule: CachedRule, session: SessionContext): RuleViolation | null {
    const maxCost = rule.condition.maxCost ?? Infinity;
    if (session.costUsd < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Session cost $${session.costUsd.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: session.id,
    };
  }

  private async checkCostCapDaily(rule: CachedRule): Promise<RuleViolation | null> {
    const maxCost = rule.condition.maxCost ?? Infinity;

    // Try Redis cache first, fall back to DB
    let todayCost = 0;
    const cached = await redis.get('pulse:daily_cost').catch(() => null);
    if (cached) {
      todayCost = parseFloat(cached);
    } else {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const result = await prisma.session.aggregate({
        where: { startedAt: { gte: todayStart } },
        _sum: { costUsd: true },
      });
      todayCost = result._sum.costUsd ?? 0;
    }

    if (todayCost < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: todayCost >= maxCost * 1.1 ? 'CRITICAL' : 'WARNING',
      message: `Daily spend $${todayCost.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: '',
    };
  }

  private async checkCostCapProject(rule: CachedRule, session: SessionContext): Promise<RuleViolation | null> {
    const maxCost = rule.condition.maxCost ?? Infinity;
    const period = rule.condition.period ?? 'daily';

    const periodStart = new Date();
    if (period === 'daily') {
      periodStart.setUTCHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      periodStart.setUTCDate(periodStart.getUTCDate() - periodStart.getUTCDay());
      periodStart.setUTCHours(0, 0, 0, 0);
    } else {
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);
    }

    const result = await prisma.session.aggregate({
      where: {
        projectSlug: session.projectSlug,
        startedAt: { gte: periodStart },
      },
      _sum: { costUsd: true },
    });
    const projectCost = result._sum.costUsd ?? 0;

    if (projectCost < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Project "${session.projectSlug}" ${period} spend $${projectCost.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: session.id,
    };
  }

  private checkModelRestriction(rule: CachedRule, event: EventContext): RuleViolation | null {
    const allowed = rule.condition.allowedModels ?? [];
    if (allowed.length === 0) return null;

    const modelMatch = allowed.some((m) => event.model.includes(m));
    if (modelMatch) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Model "${event.model}" is not allowed. Permitted: ${allowed.join(', ')}`,
      sessionId: event.sessionId,
    };
  }

  private checkBurnRateLimit(rule: CachedRule, event: EventContext, session: SessionContext): RuleViolation | null {
    const maxRate = rule.condition.maxRate ?? Infinity;
    const timerKey = `${rule.id}:${event.sessionId}`;

    if (event.burnRatePerMin < maxRate) {
      this.violationTimers.delete(timerKey);
      return null;
    }

    const now = Date.now();
    const firstViolation = this.violationTimers.get(timerKey);

    if (!firstViolation) {
      this.violationTimers.set(timerKey, now);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.type,
        action: 'ALERT',
        severity: 'WARNING',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min exceeds limit of ${maxRate}`,
        sessionId: session.id,
      };
    }

    const sustained = now - firstViolation >= 2 * 60 * 1000; // 2 minutes
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: sustained ? 'PAUSE' : 'ALERT',
      severity: sustained ? 'CRITICAL' : 'WARNING',
      message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min exceeds limit of ${maxRate}${sustained ? ' (sustained 2+ min)' : ''}`,
      sessionId: session.id,
    };
  }

  private checkSessionDuration(rule: CachedRule, session: SessionContext): RuleViolation | null {
    const maxMinutes = rule.condition.maxMinutes ?? Infinity;
    const startedAt = typeof session.startedAt === 'string' ? new Date(session.startedAt) : session.startedAt;
    const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60_000;

    if (elapsedMinutes < maxMinutes) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Session duration ${Math.round(elapsedMinutes)} min exceeds limit of ${maxMinutes} min`,
      sessionId: session.id,
    };
  }

  /** Test helper: inject rules without DB */
  _setRulesForTest(rules: CachedRule[]): void {
    this.rules = rules;
    this.violationTimers.clear();
  }
}

export const ruleEngine = new RuleEngine();
```

- [ ] **Step 4: Run tests**

Run: `cd packages/api && npx vitest run tests/rule-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/rule-engine.ts packages/api/tests/rule-engine.test.ts
git commit -m "feat(api): add RuleEngine with 6 rule types

Evaluates COST_CAP_SESSION, COST_CAP_DAILY, COST_CAP_PROJECT,
MODEL_RESTRICTION, BURN_RATE_LIMIT (with sustained escalation),
SESSION_DURATION. In-memory rule cache with scope matching."
```

---

## Task 4: AnomalyDetector

**Files:**
- Create: `packages/api/src/services/intelligence/anomaly-detector.ts`
- Create: `packages/api/tests/anomaly-detector.test.ts`

- [ ] **Step 1: Write AnomalyDetector tests**

Create `packages/api/tests/anomaly-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = { get: vi.fn(), set: vi.fn() };
vi.mock('../src/services/redis.js', () => ({ redis: mockRedis }));

import { anomalyDetector } from '../src/services/intelligence/anomaly-detector.js';

describe('AnomalyDetector', () => {
  beforeEach(() => {
    anomalyDetector._resetForTest();
  });

  describe('burn rate spike', () => {
    it('detects 3x burn rate spike as WARNING', async () => {
      // Feed baseline: 10 events at 1000 tok/min
      for (let i = 0; i < 10; i++) {
        await anomalyDetector.check(
          { sessionId: `s${i}`, burnRatePerMin: 1000, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
          { id: `s${i}`, sessionType: 'human' } as any,
        );
      }

      // Spike at 3500 tok/min (3.5x)
      const anomalies = await anomalyDetector.check(
        { sessionId: 's-spike', burnRatePerMin: 3500, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
        { id: 's-spike', sessionType: 'human' } as any,
      );

      const spike = anomalies.find((a) => a.type === 'burn_rate_spike');
      expect(spike).toBeDefined();
      expect(spike!.severity).toBe('WARNING');
    });

    it('detects 5x burn rate spike as CRITICAL', async () => {
      for (let i = 0; i < 10; i++) {
        await anomalyDetector.check(
          { sessionId: `s${i}`, burnRatePerMin: 1000, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
          { id: `s${i}`, sessionType: 'human' } as any,
        );
      }

      const anomalies = await anomalyDetector.check(
        { sessionId: 's-spike', burnRatePerMin: 5500, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
        { id: 's-spike', sessionType: 'human' } as any,
      );

      const spike = anomalies.find((a) => a.type === 'burn_rate_spike');
      expect(spike).toBeDefined();
      expect(spike!.severity).toBe('CRITICAL');
    });
  });

  describe('generation loop', () => {
    it('detects output ratio > 0.95 sustained over 3 events', async () => {
      const session = { id: 's1', sessionType: 'human' } as any;

      // 3 events with 95%+ output ratio
      for (let i = 0; i < 3; i++) {
        await anomalyDetector.check(
          { sessionId: 's1', burnRatePerMin: 1000, inputTokens: 10, outputTokens: 500, cacheReadTokens: 0 } as any,
          session,
        );
      }

      const anomalies = await anomalyDetector.check(
        { sessionId: 's1', burnRatePerMin: 1000, inputTokens: 10, outputTokens: 500, cacheReadTokens: 0 } as any,
        session,
      );

      const loop = anomalies.find((a) => a.type === 'generation_loop');
      expect(loop).toBeDefined();
      expect(loop!.severity).toBe('WARNING');
    });
  });

  describe('cost velocity', () => {
    it('detects session cost extrapolating over $100', async () => {
      const session = { id: 's1', sessionType: 'human' } as any;

      // Simulate rapid cost accumulation in recent events
      const anomalies = await anomalyDetector.check(
        { sessionId: 's1', burnRatePerMin: 50000, inputTokens: 100000, outputTokens: 100000, cacheReadTokens: 0, costDeltaUsd: 25, cumulativeCostUsd: 80 } as any,
        session,
      );

      const velocity = anomalies.find((a) => a.type === 'cost_velocity');
      expect(velocity).toBeDefined();
      expect(velocity!.severity).toBe('WARNING');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run tests/anomaly-detector.test.ts 2>&1 | head -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AnomalyDetector**

Create `packages/api/src/services/intelligence/anomaly-detector.ts`:

```typescript
import { redis } from '../redis.js';
import type { Anomaly, Severity } from '@pulse/shared';

interface RunningStats {
  burnRate: { mean: number; count: number };
}

interface SessionEventHistory {
  outputRatios: number[]; // last N output/(input+output) ratios
  recentCosts: number[];  // last 5 costDeltaUsd values
  cumulativeCost: number;
}

const EWMA_ALPHA = 0.1; // smoothing factor

class AnomalyDetector {
  private baselineStats = new Map<string, RunningStats>();
  private sessionHistory = new Map<string, SessionEventHistory>();

  async check(
    event: { sessionId: string; burnRatePerMin: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costDeltaUsd?: number; cumulativeCostUsd?: number },
    session: { id: string; sessionType: string },
  ): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Update session event history
    const history = this.getSessionHistory(event.sessionId);
    const totalTokens = event.inputTokens + event.outputTokens;
    const outputRatio = totalTokens > 0 ? event.outputTokens / totalTokens : 0;
    history.outputRatios.push(outputRatio);
    if (history.outputRatios.length > 10) history.outputRatios.shift();

    if (event.costDeltaUsd !== undefined) {
      history.recentCosts.push(event.costDeltaUsd);
      if (history.recentCosts.length > 5) history.recentCosts.shift();
    }
    if (event.cumulativeCostUsd !== undefined) {
      history.cumulativeCost = event.cumulativeCostUsd;
    }

    // 1. Burn rate spike
    const burnRateAnomaly = this.checkBurnRateSpike(event, session);
    if (burnRateAnomaly) anomalies.push(burnRateAnomaly);

    // Update baseline AFTER check (so current event is compared to prior baseline)
    this.updateBaseline(session.sessionType, event.burnRatePerMin);

    // 2. Generation loop
    const loopAnomaly = this.checkGenerationLoop(event, history);
    if (loopAnomaly) anomalies.push(loopAnomaly);

    // 3. Cost velocity
    const velocityAnomaly = this.checkCostVelocity(event, history);
    if (velocityAnomaly) anomalies.push(velocityAnomaly);

    // 4. Cache efficiency drop
    const cacheAnomaly = this.checkCacheEfficiency(event, session);
    if (cacheAnomaly) anomalies.push(cacheAnomaly);

    return anomalies;
  }

  private checkBurnRateSpike(
    event: { sessionId: string; burnRatePerMin: number },
    session: { id: string; sessionType: string },
  ): Anomaly | null {
    const stats = this.baselineStats.get(session.sessionType);
    if (!stats || stats.burnRate.count < 5) return null; // need baseline

    const ratio = event.burnRatePerMin / stats.burnRate.mean;

    if (ratio >= 5) {
      return {
        type: 'burn_rate_spike',
        severity: 'CRITICAL',
        title: 'Severe burn rate spike',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min is ${ratio.toFixed(1)}x above baseline`,
        sessionId: session.id,
        metadata: { burnRate: event.burnRatePerMin, baseline: stats.burnRate.mean, ratio },
      };
    }

    if (ratio >= 3) {
      return {
        type: 'burn_rate_spike',
        severity: 'WARNING',
        title: 'Burn rate spike detected',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min is ${ratio.toFixed(1)}x above baseline`,
        sessionId: session.id,
        metadata: { burnRate: event.burnRatePerMin, baseline: stats.burnRate.mean, ratio },
      };
    }

    return null;
  }

  private checkGenerationLoop(
    event: { sessionId: string },
    history: SessionEventHistory,
  ): Anomaly | null {
    if (history.outputRatios.length < 3) return null;

    const recent = history.outputRatios.slice(-3);
    const allHigh = recent.every((r) => r > 0.95);

    if (!allHigh) return null;

    return {
      type: 'generation_loop',
      severity: 'WARNING',
      title: 'Possible generation loop',
      message: 'Output token ratio exceeded 95% for 3+ consecutive events',
      sessionId: event.sessionId,
      metadata: { recentRatios: recent },
    };
  }

  private checkCostVelocity(
    event: { sessionId: string },
    history: SessionEventHistory,
  ): Anomaly | null {
    if (history.recentCosts.length < 3) return null;

    const avgDelta = history.recentCosts.reduce((a, b) => a + b, 0) / history.recentCosts.length;
    // Extrapolate: if current cumulative + 10 more events at this avg delta > $100
    const projected = history.cumulativeCost + avgDelta * 10;

    if (projected <= 100) return null;

    return {
      type: 'cost_velocity',
      severity: 'WARNING',
      title: 'High cost velocity',
      message: `Session cost projected to exceed $100 (current: $${history.cumulativeCost.toFixed(2)}, avg delta: $${avgDelta.toFixed(2)})`,
      sessionId: event.sessionId,
      metadata: { cumulativeCost: history.cumulativeCost, avgDelta, projected },
    };
  }

  private checkCacheEfficiency(
    event: { sessionId: string; inputTokens: number; cacheReadTokens: number },
    session: { id: string; sessionType: string },
  ): Anomaly | null {
    const total = event.cacheReadTokens + event.inputTokens;
    if (total === 0) return null;

    const cacheRatio = event.cacheReadTokens / total;
    if (cacheRatio >= 0.3) return null; // above 30% is fine

    // Only alert if we have significant tokens (not a tiny event)
    if (total < 1000) return null;

    return {
      type: 'cache_efficiency_drop',
      severity: 'INFO',
      title: 'Low cache efficiency',
      message: `Cache hit ratio ${(cacheRatio * 100).toFixed(0)}% is below 30% threshold`,
      sessionId: session.id,
      metadata: { cacheRatio, inputTokens: event.inputTokens, cacheReadTokens: event.cacheReadTokens },
    };
  }

  private updateBaseline(sessionType: string, burnRate: number): void {
    let stats = this.baselineStats.get(sessionType);
    if (!stats) {
      stats = { burnRate: { mean: burnRate, count: 1 } };
      this.baselineStats.set(sessionType, stats);
      return;
    }

    // EWMA update
    stats.burnRate.mean = EWMA_ALPHA * burnRate + (1 - EWMA_ALPHA) * stats.burnRate.mean;
    stats.burnRate.count++;
  }

  private getSessionHistory(sessionId: string): SessionEventHistory {
    let history = this.sessionHistory.get(sessionId);
    if (!history) {
      history = { outputRatios: [], recentCosts: [], cumulativeCost: 0 };
      this.sessionHistory.set(sessionId, history);
    }
    return history;
  }

  /** Persist baselines to Redis for restart recovery */
  async persistBaselines(): Promise<void> {
    const data = Object.fromEntries(this.baselineStats);
    await redis.set('pulse:anomaly_baselines', JSON.stringify(data)).catch(() => {});
  }

  /** Load baselines from Redis on startup */
  async loadBaselines(): Promise<void> {
    const raw = await redis.get('pulse:anomaly_baselines').catch(() => null);
    if (raw) {
      const data = JSON.parse(raw) as Record<string, RunningStats>;
      this.baselineStats = new Map(Object.entries(data));
    }
  }

  /** Clear session history when session ends */
  clearSession(sessionId: string): void {
    this.sessionHistory.delete(sessionId);
  }

  /** Test helper */
  _resetForTest(): void {
    this.baselineStats.clear();
    this.sessionHistory.clear();
  }
}

export const anomalyDetector = new AnomalyDetector();
```

- [ ] **Step 4: Run tests**

Run: `cd packages/api && npx vitest run tests/anomaly-detector.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/anomaly-detector.ts packages/api/tests/anomaly-detector.test.ts
git commit -m "feat(api): add AnomalyDetector with 4 detection types

Detects burn rate spikes (3x/5x EWMA baseline), generation loops
(95%+ output ratio sustained), cost velocity (extrapolation over
\$100), and cache efficiency drops. In-memory baselines with Redis
persistence for restart recovery."
```

---

## Task 5: InsightGenerator

**Files:**
- Create: `packages/api/src/services/intelligence/insight-generator.ts`
- Create: `packages/api/tests/insight-generator.test.ts`

- [ ] **Step 1: Write InsightGenerator tests**

Create `packages/api/tests/insight-generator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const mockPrisma = {
  session: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  insight: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  alert: { count: vi.fn() },
  rule: { create: vi.fn() },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('../src/services/intelligence/alert-manager.js', () => ({
  alertManager: { create: vi.fn() },
}));

import { insightGenerator } from '../src/services/intelligence/insight-generator.js';

describe('InsightGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyze — model optimization', () => {
    it('suggests cheaper model when opus used for small outputs', async () => {
      mockPrisma.session.groupBy.mockResolvedValueOnce([
        { projectSlug: 'alpha', _avg: { outputTokens: 300 }, _count: { id: 20 }, _sum: { costUsd: 100 } },
      ]);
      // No existing duplicate insight
      mockPrisma.insight.findFirst.mockResolvedValue(null);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'i1', ...args.data }));
      // Other analyses return empty
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 0 }, _avg: { costUsd: 0 }, _count: 0 });
      mockPrisma.session.groupBy.mockResolvedValue([]);

      const insights = await insightGenerator.analyze();

      const modelInsight = insights.find((i) => i.category === 'COST_OPTIMIZATION');
      expect(modelInsight).toBeDefined();
      expect(modelInsight!.title).toContain('alpha');
    });
  });

  describe('analyze — spend distribution', () => {
    it('flags dominant project spending', async () => {
      // model optimization returns nothing
      mockPrisma.session.groupBy.mockResolvedValueOnce([]);
      // spend distribution: one project dominates
      mockPrisma.session.groupBy.mockResolvedValueOnce([
        { projectSlug: 'alpha', _sum: { costUsd: 700 } },
        { projectSlug: 'beta', _sum: { costUsd: 200 } },
        { projectSlug: 'gamma', _sum: { costUsd: 100 } },
      ]);
      mockPrisma.insight.findFirst.mockResolvedValue(null);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'i2', ...args.data }));
      // Other analyses return empty
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 0 }, _avg: { costUsd: 0 }, _count: 0 });

      const insights = await insightGenerator.analyze();

      const spendInsight = insights.find((i) => i.category === 'USAGE_PATTERN');
      expect(spendInsight).toBeDefined();
      expect(spendInsight!.title).toContain('alpha');
    });
  });

  describe('deduplication', () => {
    it('skips insight if active duplicate exists', async () => {
      mockPrisma.session.groupBy.mockResolvedValueOnce([
        { projectSlug: 'alpha', _avg: { outputTokens: 300 }, _count: { id: 20 }, _sum: { costUsd: 100 } },
      ]);
      // Duplicate exists
      mockPrisma.insight.findFirst.mockResolvedValue({ id: 'existing', status: 'ACTIVE' });
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 0 }, _avg: { costUsd: 0 }, _count: 0 });
      mockPrisma.session.groupBy.mockResolvedValue([]);

      const insights = await insightGenerator.analyze();

      expect(mockPrisma.insight.create).not.toHaveBeenCalled();
      expect(insights).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run tests/insight-generator.test.ts 2>&1 | head -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement InsightGenerator**

Create `packages/api/src/services/intelligence/insight-generator.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { alertManager } from './alert-manager.js';
import type { Insight, InsightCategory } from '@pulse/shared';

const prisma = new PrismaClient();

function dedupKey(category: string, identifiers: Record<string, unknown>): string {
  const sorted = JSON.stringify(identifiers, Object.keys(identifiers).sort());
  const hash = createHash('sha256').update(sorted).digest('hex').slice(0, 16);
  return `${category}:${hash}`;
}

class InsightGenerator {
  /** Run all analyses. Called every 5 minutes by scheduler. */
  async analyze(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const modelOptInsights = await this.analyzeModelOptimization();
    insights.push(...modelOptInsights);

    const spendInsights = await this.analyzeSpendDistribution();
    insights.push(...spendInsights);

    const costTrendInsights = await this.analyzeCostTrends();
    insights.push(...costTrendInsights);

    return insights;
  }

  /** Detect sessions using expensive models for simple tasks */
  private async analyzeModelOptimization(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Find projects using opus-class models with low avg output
    const projectStats = await prisma.session.groupBy({
      by: ['projectSlug'],
      where: {
        model: { contains: 'opus' },
        startedAt: { gte: sevenDaysAgo },
        endedAt: { not: null },
      },
      _avg: { outputTokens: true },
      _count: { id: true },
      _sum: { costUsd: true },
      having: { id: { _count: { gte: 5 } } },
    });

    for (const stat of projectStats) {
      if (!stat._avg.outputTokens || stat._avg.outputTokens > 500) continue;

      const estimatedSavings = (stat._sum.costUsd ?? 0) * 0.6; // Sonnet is ~60% cheaper
      const key = dedupKey('COST_OPTIMIZATION', { projectName: stat.projectSlug, suggestion: 'downgrade_model' });

      const existing = await prisma.insight.findFirst({
        where: {
          dedupKey: key,
          status: 'ACTIVE',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const insight = await prisma.insight.create({
        data: {
          category: 'COST_OPTIMIZATION',
          title: `Switch "${stat.projectSlug}" to Sonnet`,
          description: `${stat._count.id} Opus sessions in the last 7 days averaged only ${Math.round(stat._avg.outputTokens)} output tokens. Sonnet can handle this workload at ~60% lower cost.`,
          impact: { estimatedSavings: Math.round(estimatedSavings * 100) / 100, confidence: 0.8 },
          metadata: {
            projectName: stat.projectSlug,
            sessionCount: stat._count.id,
            avgOutputTokens: Math.round(stat._avg.outputTokens),
            suggestedRule: {
              type: 'MODEL_RESTRICTION',
              scope: { projectName: stat.projectSlug },
              condition: { allowedModels: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
              action: 'BLOCK',
            },
          },
          dedupKey: key,
        },
      });

      insights.push(insight as unknown as Insight);
    }

    return insights;
  }

  /** Detect dominant project spending */
  private async analyzeSpendDistribution(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const projectSpend = await prisma.session.groupBy({
      by: ['projectSlug'],
      where: { startedAt: { gte: sevenDaysAgo } },
      _sum: { costUsd: true },
    });

    const totalSpend = projectSpend.reduce((acc, p) => acc + (p._sum.costUsd ?? 0), 0);
    if (totalSpend === 0) return insights;

    for (const project of projectSpend) {
      const cost = project._sum.costUsd ?? 0;
      const percentage = cost / totalSpend;
      if (percentage < 0.5) continue; // Only flag >50% concentration

      const key = dedupKey('USAGE_PATTERN', { topProject: project.projectSlug });
      const existing = await prisma.insight.findFirst({
        where: {
          dedupKey: key,
          status: 'ACTIVE',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const insight = await prisma.insight.create({
        data: {
          category: 'USAGE_PATTERN',
          title: `"${project.projectSlug}" accounts for ${Math.round(percentage * 100)}% of spend`,
          description: `In the last 7 days, "${project.projectSlug}" cost $${cost.toFixed(2)} out of $${totalSpend.toFixed(2)} total. Consider setting a project cost cap.`,
          impact: { percentChange: Math.round(percentage * 100) },
          metadata: { projectName: project.projectSlug, cost, totalSpend, percentage },
          dedupKey: key,
        },
      });

      insights.push(insight as unknown as Insight);
    }

    return insights;
  }

  /** Detect week-over-week cost trend changes */
  private async analyzeCostTrends(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const [thisWeek, lastWeek] = await Promise.all([
      prisma.session.aggregate({
        where: { startedAt: { gte: thisWeekStart } },
        _avg: { costUsd: true },
        _count: true,
      }),
      prisma.session.aggregate({
        where: { startedAt: { gte: lastWeekStart, lt: thisWeekStart } },
        _avg: { costUsd: true },
        _count: true,
      }),
    ]);

    const thisAvg = thisWeek._avg.costUsd ?? 0;
    const lastAvg = lastWeek._avg.costUsd ?? 0;

    if (lastAvg > 0 && thisAvg > 0) {
      const change = (thisAvg - lastAvg) / lastAvg;
      if (change >= 0.25) {
        const key = dedupKey('USAGE_PATTERN', { trend: 'cost_increase_weekly' });
        const existing = await prisma.insight.findFirst({
          where: {
            dedupKey: key,
            status: 'ACTIVE',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          const insight = await prisma.insight.create({
            data: {
              category: 'USAGE_PATTERN',
              title: `Avg session cost up ${Math.round(change * 100)}% this week`,
              description: `Average session cost increased from $${lastAvg.toFixed(2)} to $${thisAvg.toFixed(2)} week-over-week.`,
              impact: { percentChange: Math.round(change * 100) },
              metadata: { thisWeekAvg: thisAvg, lastWeekAvg: lastAvg },
              dedupKey: key,
            },
          });
          insights.push(insight as unknown as Insight);
        }
      }
    }

    return insights;
  }

  /** Weekly digest — called by scheduler on Sunday */
  async weeklyDigest(): Promise<Insight | null> {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const [stats, alertCount] = await Promise.all([
      prisma.session.aggregate({
        where: { startedAt: { gte: weekStart } },
        _sum: { costUsd: true },
        _count: true,
      }),
      prisma.alert.count({
        where: { createdAt: { gte: weekStart } },
      }),
    ]);

    const sessionCount = stats._count;
    const totalCost = stats._sum.costUsd ?? 0;

    const key = dedupKey('PLAN_RECOMMENDATION', { type: 'weekly_digest', week: weekStart.toISOString().slice(0, 10) });

    const insight = await prisma.insight.create({
      data: {
        category: 'PLAN_RECOMMENDATION',
        title: `Weekly digest: ${sessionCount} sessions, $${totalCost.toFixed(0)} spent`,
        description: `This week: ${sessionCount} sessions totaling $${totalCost.toFixed(2)}. ${alertCount} alerts generated.`,
        impact: {},
        metadata: { sessionCount, totalCost, alertCount, weekStart: weekStart.toISOString() },
        dedupKey: key,
      },
    });

    // Also create an alert for the digest
    await alertManager.create({
      type: 'INSIGHT',
      severity: 'INFO',
      title: insight.title,
      message: insight.description,
      insightId: insight.id,
    });

    return insight as unknown as Insight;
  }

  /** Apply an insight — creates associated rule if applicable */
  async applyInsight(insightId: string): Promise<{ insight: Insight; ruleId?: string }> {
    const insight = await prisma.insight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');

    let ruleId: string | undefined;

    // Auto-create rule if insight has suggestedRule metadata
    const metadata = insight.metadata as Record<string, unknown>;
    if (insight.category === 'COST_OPTIMIZATION' && metadata.suggestedRule) {
      const suggested = metadata.suggestedRule as Record<string, unknown>;
      const rule = await prisma.rule.create({
        data: {
          name: `Auto: ${insight.title}`,
          type: suggested.type as string,
          scope: suggested.scope as object,
          condition: suggested.condition as object,
          action: suggested.action as string,
        } as any,
      });
      ruleId = rule.id;
    }

    const updated = await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });

    return { insight: updated as unknown as Insight, ruleId };
  }
}

export const insightGenerator = new InsightGenerator();
```

- [ ] **Step 4: Run tests**

Run: `cd packages/api && npx vitest run tests/insight-generator.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/insight-generator.ts packages/api/tests/insight-generator.test.ts
git commit -m "feat(api): add InsightGenerator for batch trend analysis

Analyzes model optimization (suggest cheaper models), spend distribution
(flag dominant projects), and cost trends (week-over-week changes).
Weekly digest on Sundays. Deduplication via SHA-256 dedupKey. Apply
logic auto-creates rules from COST_OPTIMIZATION insights."
```

---

## Task 6: Scheduler + WebSocket Integration

**Files:**
- Create: `packages/api/src/services/intelligence/scheduler.ts`
- Modify: `packages/api/src/ws-server.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/services/session-service.ts`

- [ ] **Step 1: Install node-cron**

Run: `cd packages/api && pnpm add node-cron && pnpm add -D @types/node-cron`

- [ ] **Step 2: Create Scheduler**

Create `packages/api/src/services/intelligence/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { ruleEngine } from './rule-engine.js';
import { anomalyDetector } from './anomaly-detector.js';
import { insightGenerator } from './insight-generator.js';
import { redis } from '../redis.js';

class Scheduler {
  private intervals: ReturnType<typeof setInterval>[] = [];
  private cronJobs: cron.ScheduledTask[] = [];

  async start(): Promise<void> {
    // Load initial state
    await ruleEngine.refreshCache().catch((e) => console.warn('Initial rule cache failed:', e));
    await anomalyDetector.loadBaselines().catch((e) => console.warn('Baseline load failed:', e));

    // Every 60s: refresh rule cache
    this.intervals.push(
      setInterval(() => {
        ruleEngine.refreshCache().catch(() => {});
      }, 60_000),
    );

    // Every 60s: persist anomaly baselines
    this.intervals.push(
      setInterval(() => {
        anomalyDetector.persistBaselines().catch(() => {});
      }, 60_000),
    );

    // Every 5 min: run insight analysis
    this.intervals.push(
      setInterval(() => {
        insightGenerator.analyze().catch((e) => console.error('Insight analysis failed:', e));
      }, 5 * 60_000),
    );

    // Every midnight UTC: reset daily cost counter
    this.intervals.push(
      setInterval(() => {
        const now = new Date();
        if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
          redis.del('pulse:daily_cost').catch(() => {});
        }
      }, 60_000),
    );

    // Sunday 9am UTC: weekly digest
    const weeklyJob = cron.schedule('0 9 * * 0', () => {
      insightGenerator.weeklyDigest().catch((e) => console.error('Weekly digest failed:', e));
    }, { timezone: 'UTC' });
    this.cronJobs.push(weeklyJob);

    console.log('Intelligence scheduler started');
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.cronJobs.forEach((j) => j.stop());
    this.cronJobs = [];
    console.log('Intelligence scheduler stopped');
  }
}

export const scheduler = new Scheduler();
```

- [ ] **Step 3: Add pause/resume to session-service**

In `packages/api/src/services/session-service.ts`, add after the `endSession` function (after line 85):

```typescript
export async function pauseSession(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'PAUSED' },
  });
  await publishSessionUpdate(session);
  return session;
}

export async function resumeSession(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE' },
  });
  await publishSessionUpdate(session);
  return session;
}
```

- [ ] **Step 4: Update endSession to set ENDED status**

In `packages/api/src/services/session-service.ts`, update the `endSession` function. Change line 81 from:

```typescript
    data: { endedAt: new Date() },
```

to:

```typescript
    data: { endedAt: new Date(), status: 'ENDED' },
```

- [ ] **Step 5: Update WebSocket server with session registry + intelligence integration**

Replace the entire contents of `packages/api/src/ws-server.ts` with:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redisSub } from './services/redis.js';
import { startSession, updateSession, endSession } from './services/session-service.js';
import { ruleEngine } from './services/intelligence/rule-engine.js';
import { anomalyDetector } from './services/intelligence/anomaly-detector.js';
import { alertManager } from './services/intelligence/alert-manager.js';

interface TaggedWebSocket extends WebSocket {
  role?: 'agent' | 'dashboard';
  isAlive?: boolean;
}

// Map sessionId → agent WebSocket for targeted pause/resume
const sessionRegistry = new Map<string, TaggedWebSocket>();

export function createWsServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  redisSub.subscribe('pulse:token_events', 'pulse:session_updates', 'pulse:alerts').catch(() => {
    console.warn('Redis subscribe failed — WebSocket broadcast will use direct relay');
  });

  redisSub.on('message', (channel, message) => {
    if (channel === 'pulse:alerts') {
      broadcast(wss, { type: 'alert', data: JSON.parse(message) }, 'dashboard');
    } else {
      const target = channel === 'pulse:token_events' ? 'token_event' : 'session_update';
      broadcast(wss, { type: target, data: JSON.parse(message) }, 'dashboard');
    }
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
          handleAgentMessage(msg, ws).catch(() => {});
          broadcast(wss, { type: msg.type, data: msg.data }, 'dashboard');
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      // Clean up session registry entries for this connection
      for (const [sessionId, socket] of sessionRegistry) {
        if (socket === ws) sessionRegistry.delete(sessionId);
      }
    });
  });

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

async function handleAgentMessage(
  msg: { type: string; data: Record<string, unknown> },
  agentWs: TaggedWebSocket,
): Promise<void> {
  if (msg.type === 'session_start') {
    const sessionId = msg.data.id as string;
    sessionRegistry.set(sessionId, agentWs);
    await startSession({
      id: sessionId,
      tool: msg.data.tool as string,
      projectSlug: msg.data.projectSlug as string,
      sessionType: msg.data.sessionType as string,
      model: msg.data.model as string,
    }).catch(() => {}); // ignore if session already exists
  } else if (msg.type === 'token_event') {
    const d = msg.data;
    const sessionId = d.sessionId as string;

    // Register session if not already registered
    if (!sessionRegistry.has(sessionId)) {
      sessionRegistry.set(sessionId, agentWs);
    }

    const result = await updateSession({
      sessionId,
      inputTokens: d.inputTokens as number,
      outputTokens: d.outputTokens as number,
      cacheCreationTokens: d.cacheCreationTokens as number,
      cacheReadTokens: d.cacheReadTokens as number,
      costDeltaUsd: d.costDeltaUsd as number,
      cumulativeInputTokens: d.cumulativeInputTokens as number,
      cumulativeOutputTokens: d.cumulativeOutputTokens as number,
      cumulativeCostUsd: d.cumulativeCostUsd as number,
      burnRatePerMin: d.burnRatePerMin as number,
      model: d.model as string,
      tool: d.tool as string,
      projectSlug: d.projectSlug as string,
      sessionType: d.sessionType as string,
    });

    // Update daily cost counter in Redis
    const { redis } = await import('./services/redis.js');
    redis.incrbyfloat('pulse:daily_cost', d.costDeltaUsd as number).catch(() => {});

    // Intelligence: evaluate rules + detect anomalies
    const [violations, anomalies] = await Promise.all([
      ruleEngine.evaluate(d as any, result.session as any).catch(() => []),
      anomalyDetector.check(d as any, result.session as any).catch(() => []),
    ]);

    for (const v of violations) {
      await alertManager.create({
        type: 'RULE_BREACH',
        severity: v.severity,
        title: `Rule breached: ${v.ruleName}`,
        message: v.message,
        sessionId: v.sessionId || undefined,
        ruleId: v.ruleId,
        metadata: { ruleType: v.ruleType, action: v.action },
      }).catch(() => {});

      if (v.action === 'PAUSE') {
        sendToAgent(v.sessionId, {
          type: 'session_pause',
          sessionId: v.sessionId,
          reason: v.message,
          ruleId: v.ruleId,
        });
      }
    }

    for (const a of anomalies) {
      await alertManager.create({
        type: 'ANOMALY',
        severity: a.severity,
        title: a.title,
        message: a.message,
        sessionId: a.sessionId,
        metadata: a.metadata,
      }).catch(() => {});
    }
  } else if (msg.type === 'session_end') {
    const sessionId = msg.data.sessionId as string;
    sessionRegistry.delete(sessionId);
    anomalyDetector.clearSession(sessionId);
    await endSession(sessionId);
  }
}

/** Send a message to a specific agent by session ID */
export function sendToAgent(sessionId: string, message: unknown): void {
  const ws = sessionRegistry.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
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

- [ ] **Step 6: Update server startup to start scheduler**

Replace the entire contents of `packages/api/src/index.ts` with:

```typescript
import { createServer } from 'http';
import { createApp } from './app.js';
import { createWsServer } from './ws-server.js';
import { redis, connectRedis } from './services/redis.js';
import { scheduler } from './services/intelligence/scheduler.js';

const port = parseInt(process.env.API_PORT || '3001', 10);
const app = createApp();
const server = createServer(app);

createWsServer(server);
connectRedis().catch(() => {});

server.listen(port, () => {
  console.log(`Pulse API running on http://localhost:${port}`);
  scheduler.start().catch((e) => console.error('Scheduler start failed:', e));
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  scheduler.stop();
  redis.disconnect();
  server.close();
  process.exit(0);
});
```

- [ ] **Step 7: Build and verify no TypeScript errors**

Run: `cd packages/api && pnpm build`
Expected: Build succeeds with zero errors

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/intelligence/scheduler.ts packages/api/src/ws-server.ts packages/api/src/index.ts packages/api/src/services/session-service.ts packages/api/package.json packages/api/pnpm-lock.yaml
git commit -m "feat(api): add Scheduler, WebSocket intelligence integration, session pause/resume

Scheduler runs rule cache refresh (60s), anomaly baseline persistence
(60s), insight analysis (5min), weekly digest (Sun 9am UTC).
WebSocket server integrates RuleEngine + AnomalyDetector on every
token_event, session registry for targeted pause, pulse:alerts channel."
```

---

## Task 7: API Routes (Rules, Alerts, Insights, Webhooks)

**Files:**
- Create: `packages/api/src/routes/rules.ts`
- Create: `packages/api/src/routes/alerts.ts`
- Create: `packages/api/src/routes/insights.ts`
- Create: `packages/api/src/routes/webhooks.ts`
- Modify: `packages/api/src/routes/sessions.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Create Rules router**

Create `packages/api/src/routes/rules.ts`:

```typescript
import { Router, IRouter } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const rulesRouter: IRouter = Router();

rulesRouter.get('/', async (_req, res) => {
  try {
    const rules = await prisma.rule.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.get('/:id', async (req, res) => {
  try {
    const rule = await prisma.rule.findUnique({ where: { id: req.params.id } });
    if (!rule) { res.status(404).json({ error: 'Rule not found' }); return; }
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.post('/', async (req, res) => {
  try {
    const rule = await prisma.rule.create({ data: req.body });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.put('/:id', async (req, res) => {
  try {
    const rule = await prisma.rule.update({ where: { id: req.params.id }, data: req.body });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.rule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.post('/:id/toggle', async (req, res) => {
  try {
    const rule = await prisma.rule.findUnique({ where: { id: req.params.id } });
    if (!rule) { res.status(404).json({ error: 'Rule not found' }); return; }
    const updated = await prisma.rule.update({
      where: { id: req.params.id },
      data: { enabled: !rule.enabled },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 2: Create Alerts router**

Create `packages/api/src/routes/alerts.ts`:

```typescript
import { Router, IRouter } from 'express';
import { alertManager } from '../services/intelligence/alert-manager.js';

export const alertsRouter: IRouter = Router();

alertsRouter.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      type: req.query.type as string | undefined,
      since: req.query.since as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await alertManager.getAlerts(filters as any);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.get('/unread-count', async (_req, res) => {
  try {
    const count = await alertManager.getUnreadCount();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.get('/:id', async (req, res) => {
  try {
    const alert = await alertManager.getById(req.params.id);
    if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/read', async (req, res) => {
  try {
    await alertManager.markRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/dismiss', async (req, res) => {
  try {
    await alertManager.dismiss(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/resolve', async (req, res) => {
  try {
    await alertManager.resolve(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/batch/read', async (req, res) => {
  try {
    await alertManager.batchMarkRead(req.body.ids);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/batch/dismiss', async (req, res) => {
  try {
    await alertManager.batchDismiss(req.body.ids);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 3: Create Insights router**

Create `packages/api/src/routes/insights.ts`:

```typescript
import { Router, IRouter } from 'express';
import { PrismaClient } from '@prisma/client';
import { insightGenerator } from '../services/intelligence/insight-generator.js';

const prisma = new PrismaClient();
export const insightsRouter: IRouter = Router();

insightsRouter.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.status) where.status = req.query.status;

    const [insights, total] = await Promise.all([
      prisma.insight.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.insight.count({ where }),
    ]);

    res.json({ insights, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.get('/:id', async (req, res) => {
  try {
    const insight = await prisma.insight.findUnique({ where: { id: req.params.id } });
    if (!insight) { res.status(404).json({ error: 'Insight not found' }); return; }
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.put('/:id/dismiss', async (req, res) => {
  try {
    const insight = await prisma.insight.update({
      where: { id: req.params.id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.put('/:id/apply', async (req, res) => {
  try {
    const result = await insightGenerator.applyInsight(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 4: Create Webhooks router**

Create `packages/api/src/routes/webhooks.ts`:

```typescript
import { Router, IRouter } from 'express';
import { PrismaClient } from '@prisma/client';
import { webhookService } from '../services/intelligence/webhook-service.js';

const prisma = new PrismaClient();
export const webhooksRouter: IRouter = Router();

webhooksRouter.get('/', async (_req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
    // Omit secrets from response
    res.json(webhooks.map((w) => ({ ...w, secret: w.secret ? '***' : null })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.get('/:id', async (req, res) => {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!webhook) { res.status(404).json({ error: 'Webhook not found' }); return; }
    res.json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/', async (req, res) => {
  try {
    const webhook = await prisma.webhook.create({ data: req.body });
    res.status(201).json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.put('/:id', async (req, res) => {
  try {
    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: req.body });
    res.json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/:id/test', async (req, res) => {
  try {
    const result = await webhookService.test(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/:id/enable', async (req, res) => {
  try {
    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: { enabled: true, failCount: 0 },
    });
    res.json(webhook);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 5: Add pause/resume to Sessions router**

In `packages/api/src/routes/sessions.ts`, add these imports to line 3-4 (alongside existing imports):

```typescript
import {
  startSession,
  updateSession,
  endSession,
  getSessionHistory,
  getSessionById,
  pauseSession,
  resumeSession,
} from '../services/session-service.js';
```

Then add these routes at the end of the file (after line 59):

```typescript
sessionsRouter.post('/:id/pause', async (req, res) => {
  try {
    const session = await pauseSession(req.params.id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

sessionsRouter.post('/:id/resume', async (req, res) => {
  try {
    const session = await resumeSession(req.params.id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 6: Register new routes in app.ts**

Replace the entire contents of `packages/api/src/app.ts` with:

```typescript
import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { rulesRouter } from './routes/rules.js';
import { alertsRouter } from './routes/alerts.js';
import { insightsRouter } from './routes/insights.js';
import { webhooksRouter } from './routes/webhooks.js';
import { authMiddleware } from './middleware/auth.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/sessions', authMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, dashboardRouter);
  app.use('/api/rules', authMiddleware, rulesRouter);
  app.use('/api/alerts', authMiddleware, alertsRouter);
  app.use('/api/insights', authMiddleware, insightsRouter);
  app.use('/api/webhooks', authMiddleware, webhooksRouter);

  return app;
}
```

- [ ] **Step 7: Build and verify**

Run: `cd packages/api && pnpm build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routes/ packages/api/src/app.ts
git commit -m "feat(api): add REST routes for rules, alerts, insights, webhooks

Rules CRUD with toggle. Alerts with pagination, batch read/dismiss.
Insights with dismiss/apply (auto-creates rules). Webhooks CRUD with
test and re-enable. Session pause/resume endpoints."
```

---

## Task 8: Agent Pause/Resume Support

**Files:**
- Modify: `packages/agent/src/telemetry-streamer.ts`
- Modify: `packages/agent/src/session-tracker.ts`

- [ ] **Step 1: Add message listener to TelemetryStreamer**

Replace the entire contents of `packages/agent/src/telemetry-streamer.ts` with:

```typescript
import WebSocket from 'ws';
import type { TokenEvent } from '@pulse/shared';

export type PauseHandler = (sessionId: string, reason: string) => void;
export type ResumeHandler = (sessionId: string) => void;

export class TelemetryStreamer {
  private ws: WebSocket | null = null;
  private buffer: unknown[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pausedSessions = new Set<string>();
  private pauseBuffer = new Map<string, unknown[]>();
  private onPause?: PauseHandler;
  private onResume?: ResumeHandler;

  constructor(private apiUrl: string, private apiKey: string) {}

  /** Register handlers for pause/resume events from the server */
  setHandlers(onPause: PauseHandler, onResume: ResumeHandler): void {
    this.onPause = onPause;
    this.onResume = onResume;
  }

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

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleServerMessage(msg);
        } catch {
          // ignore malformed messages
        }
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

  private handleServerMessage(msg: { type: string; sessionId?: string; reason?: string }): void {
    if (msg.type === 'session_pause' && msg.sessionId) {
      this.pausedSessions.add(msg.sessionId);
      console.log(`Session ${msg.sessionId} paused: ${msg.reason ?? 'no reason'}`);
      this.onPause?.(msg.sessionId, msg.reason ?? '');
    } else if (msg.type === 'session_resume' && msg.sessionId) {
      this.pausedSessions.delete(msg.sessionId);
      console.log(`Session ${msg.sessionId} resumed`);
      this.flushPauseBuffer(msg.sessionId);
      this.onResume?.(msg.sessionId);
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

    // Buffer events for paused sessions instead of sending
    const sessionId = (data as Record<string, unknown>)?.sessionId as string;
    if (sessionId && this.pausedSessions.has(sessionId)) {
      const buf = this.pauseBuffer.get(sessionId) ?? [];
      buf.push(message);
      this.pauseBuffer.set(sessionId, buf);
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.buffer.push(message);
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
    this.pausedSessions.delete(sessionId);
    this.pauseBuffer.delete(sessionId);
    this.send('session_end', { sessionId });
  }

  private flushBuffer(): void {
    while (this.buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buffer.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  private flushPauseBuffer(sessionId: string): void {
    const buf = this.pauseBuffer.get(sessionId);
    if (!buf) return;
    this.pauseBuffer.delete(sessionId);
    for (const msg of buf) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.buffer.push(msg);
      }
    }
  }

  isSessionPaused(sessionId: string): boolean {
    return this.pausedSessions.has(sessionId);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 2: Add pause/resume to SessionTracker**

Replace the entire contents of `packages/agent/src/session-tracker.ts` with:

```typescript
import { calculateCost, normalizeProjectSlug } from '@pulse/shared';
import type { TokenEvent, SessionType } from '@pulse/shared';
import { classifySession } from './session-classifier.js';
import type { ParsedMessage } from './claude-reader.js';

interface TrackedSession {
  sessionId: string;
  tool: 'claude_code';
  model: string;
  projectSlug: string;
  sessionType: SessionType;
  status: 'active' | 'paused';
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

    if (!session) {
      session = {
        sessionId: msg.sessionId,
        tool: 'claude_code',
        model: msg.model,
        projectSlug: normalizeProjectSlug(msg.cwd),
        sessionType: classifySession({ entrypoint: msg.entrypoint, userType: msg.userType }),
        status: 'active',
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

    const deltaCost = calculateCost({
      model: msg.model,
      inputTokens: msg.inputTokens,
      outputTokens: msg.outputTokens,
      cacheCreationTokens: msg.cacheCreationTokens,
      cacheReadTokens: msg.cacheReadTokens,
    });

    session.cumulativeInputTokens += msg.inputTokens;
    session.cumulativeOutputTokens += msg.outputTokens;
    session.cumulativeCacheCreationTokens += msg.cacheCreationTokens;
    session.cumulativeCacheReadTokens += msg.cacheReadTokens;
    session.cumulativeCostUsd += deltaCost;
    session.model = msg.model;
    session.lastActivityAt = msg.timestamp;

    const elapsedMs = new Date(msg.timestamp).getTime() - new Date(session.startedAt).getTime();
    const elapsedMin = Math.max(elapsedMs / 60000, 0.1);
    const totalTokens = session.cumulativeInputTokens + session.cumulativeOutputTokens;
    const burnRatePerMin = totalTokens / elapsedMin;

    return {
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
  }

  getActiveSessions(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  pause(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'paused';
  }

  resume(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'active';
  }

  markEnded(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
```

- [ ] **Step 3: Build agent package**

Run: `cd packages/agent && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Run existing agent tests**

Run: `cd packages/agent && pnpm test`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/telemetry-streamer.ts packages/agent/src/session-tracker.ts
git commit -m "feat(agent): add pause/resume support for session enforcement

TelemetryStreamer listens for session_pause/session_resume from server,
buffers events for paused sessions, flushes on resume. SessionTracker
tracks session status (active/paused) with pause/resume methods."
```

---

## Task 9: Web — SWR Hooks + Sidebar Alert Badge

**Files:**
- Create: `packages/web/src/hooks/use-intelligence.ts`
- Modify: `packages/web/src/hooks/use-websocket.ts`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create intelligence SWR hooks**

Create `packages/web/src/hooks/use-intelligence.ts`:

```typescript
'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';
import type { Rule, Alert, Insight, Webhook, AlertFilters } from '@pulse/shared';

const fetcher = <T,>(path: string) => fetchApi<T>(path);

interface AlertsResponse {
  alerts: Alert[];
  total: number;
  page: number;
  limit: number;
}

interface InsightsResponse {
  insights: Insight[];
  total: number;
  page: number;
  limit: number;
}

export function useAlerts(filters?: Partial<AlertFilters>) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const query = params.toString() ? `?${params}` : '';

  return useSWR<AlertsResponse>(`/api/alerts${query}`, fetcher<AlertsResponse>, {
    refreshInterval: 10000,
  });
}

export function useUnreadAlertCount() {
  return useSWR<{ count: number }>('/api/alerts/unread-count', fetcher<{ count: number }>, {
    refreshInterval: 10000,
  });
}

export function useRules() {
  return useSWR<Rule[]>('/api/rules', fetcher<Rule[]>, {
    refreshInterval: 30000,
  });
}

export function useInsights(filters?: { category?: string; status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const query = params.toString() ? `?${params}` : '';

  return useSWR<InsightsResponse>(`/api/insights${query}`, fetcher<InsightsResponse>, {
    refreshInterval: 30000,
  });
}

export function useWebhooks() {
  return useSWR<Webhook[]>('/api/webhooks', fetcher<Webhook[]>, {
    refreshInterval: 30000,
  });
}

// ── Mutation helpers ────────────────────────────────

export async function toggleRule(id: string): Promise<Rule> {
  return fetchApi<Rule>(`/api/rules/${id}/toggle`, { method: 'POST' });
}

export async function createRule(data: Partial<Rule>): Promise<Rule> {
  return fetchApi<Rule>('/api/rules', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteRule(id: string): Promise<void> {
  await fetchApi(`/api/rules/${id}`, { method: 'DELETE' });
}

export async function markAlertRead(id: string): Promise<void> {
  await fetchApi(`/api/alerts/${id}/read`, { method: 'PUT' });
}

export async function dismissAlert(id: string): Promise<void> {
  await fetchApi(`/api/alerts/${id}/dismiss`, { method: 'PUT' });
}

export async function batchMarkAlertsRead(ids: string[]): Promise<void> {
  await fetchApi('/api/alerts/batch/read', { method: 'PUT', body: JSON.stringify({ ids }) });
}

export async function batchDismissAlerts(ids: string[]): Promise<void> {
  await fetchApi('/api/alerts/batch/dismiss', { method: 'PUT', body: JSON.stringify({ ids }) });
}

export async function dismissInsight(id: string): Promise<void> {
  await fetchApi(`/api/insights/${id}/dismiss`, { method: 'PUT' });
}

export async function applyInsight(id: string): Promise<{ insight: Insight; ruleId?: string }> {
  return fetchApi(`/api/insights/${id}/apply`, { method: 'PUT' });
}

export async function createWebhook(data: Partial<Webhook>): Promise<Webhook> {
  return fetchApi<Webhook>('/api/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: string): Promise<void> {
  await fetchApi(`/api/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  return fetchApi(`/api/webhooks/${id}/test`, { method: 'POST' });
}
```

- [ ] **Step 2: Update sidebar with dynamic alert badge**

Replace the entire contents of `packages/web/src/components/layout/sidebar.tsx` with:

```typescript
'use client';

import {
  LayoutDashboard,
  Radio,
  History,
  Lightbulb,
  Bell,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { NavItem } from '@/components/ui/nav-item';
import { PlanCard } from '@/components/ui/plan-card';
import { useLiveSummary } from '@/hooks/use-sessions';
import { useUnreadAlertCount } from '@/hooks/use-intelligence';

export function Sidebar() {
  const { data: summary } = useLiveSummary();
  const { data: alertData } = useUnreadAlertCount();
  const totalValue = summary?.totalCostToday ?? 0;
  const unreadAlerts = alertData?.count ?? 0;

  return (
    <aside className="w-[240px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="size-8 rounded-[9px] flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="white" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <span className="text-[17px] font-bold text-[var(--text-1)]">Pulse</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        {/* Monitor */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Monitor
          </p>
          <div className="space-y-0.5">
            <NavItem href="/" label="Dashboard" icon={LayoutDashboard} />
            <NavItem href="/live" label="Live View" icon={Radio} />
            <NavItem href="/sessions" label="Sessions" icon={History} />
          </div>
        </div>

        {/* Intelligence */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Intelligence
          </p>
          <div className="space-y-0.5">
            <NavItem href="/insights" label="Insights" icon={Lightbulb} />
            <NavItem href="/alerts" label="Alerts" icon={Bell} badge={unreadAlerts > 0 ? unreadAlerts : undefined} />
            <NavItem href="/rules" label="Rules" icon={ShieldCheck} />
          </div>
        </div>

        {/* Configure */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Configure
          </p>
          <div className="space-y-0.5">
            <NavItem href="/settings" label="Settings" icon={Settings} />
          </div>
        </div>
      </nav>

      {/* Plan card pinned to bottom */}
      <div className="px-3 pb-4 pt-2">
        <PlanCard planName="Max Plan" monthlyCost={100} totalValue={totalValue} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Build web package**

Run: `cd packages/web && pnpm build`
Expected: Build succeeds (or at minimum no TypeScript errors in the modified files)

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/use-intelligence.ts packages/web/src/components/layout/sidebar.tsx
git commit -m "feat(web): add intelligence SWR hooks and dynamic alert badge

New hooks: useAlerts, useUnreadAlertCount, useRules, useInsights,
useWebhooks + mutation helpers. Sidebar shows real-time unread alert
count badge on Alerts nav item."
```

---

## Task 10: Alerts Page

**Files:**
- Modify: `packages/web/src/app/alerts/page.tsx`

- [ ] **Step 1: Rewrite Alerts page**

Replace the entire contents of `packages/web/src/app/alerts/page.tsx` with:

```typescript
'use client';

import { useState } from 'react';
import { Bell, ExternalLink, Check, X, Eye } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAlerts, markAlertRead, dismissAlert, batchMarkAlertsRead } from '@/hooks/use-intelligence';
import { formatRelativeTime } from '@/lib/format';
import type { AlertStatus, Severity, AlertType } from '@pulse/shared';

const SEVERITY_VARIANT: Record<Severity, 'blue' | 'amber' | 'red'> = {
  INFO: 'blue',
  WARNING: 'amber',
  CRITICAL: 'red',
};

const TYPE_LABEL: Record<AlertType, string> = {
  RULE_BREACH: 'Rule Breach',
  ANOMALY: 'Anomaly',
  INSIGHT: 'Insight',
  SYSTEM: 'System',
};

export default function AlertsPage() {
  const { connected } = useWebSocket();
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const { data, mutate } = useAlerts({
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
    limit: 50,
  });

  const alerts = data?.alerts ?? [];

  async function handleMarkRead(id: string) {
    await markAlertRead(id);
    mutate();
  }

  async function handleDismiss(id: string) {
    await dismissAlert(id);
    mutate();
  }

  async function handleMarkAllRead() {
    const activeIds = alerts.filter((a) => a.status === 'ACTIVE').map((a) => a.id);
    if (activeIds.length > 0) {
      await batchMarkAlertsRead(activeIds);
      mutate();
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Alerts" subtitle="Real-time notifications from rules and anomaly detection" connected={connected} />

      {/* Filters + actions */}
      <div className="mt-6 flex items-center gap-3">
        <select
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AlertStatus | '')}
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="READ">Read</option>
          <option value="DISMISSED">Dismissed</option>
        </select>

        <select
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
        >
          <option value="">All Severity</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>

        <button
          onClick={handleMarkAllRead}
          className="ml-auto text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          Mark all read
        </button>
      </div>

      {/* Alert list */}
      <div className="mt-4 space-y-2">
        {alerts.length === 0 && (
          <div className="text-center py-16 text-[var(--text-3)]">
            <Bell size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-[15px] font-medium">No alerts yet</p>
            <p className="text-[13px] mt-1">Alerts will appear here when rules are triggered or anomalies detected</p>
          </div>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-[16px] border bg-[var(--surface)] p-4 transition-colors ${
              alert.status === 'ACTIVE'
                ? 'border-[var(--border)]'
                : 'border-[var(--border-light)] opacity-60'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatTag variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</StatTag>
                  <StatTag variant="neutral">{TYPE_LABEL[alert.type]}</StatTag>
                  <span className="text-[11px] text-[var(--text-3)]">
                    {formatRelativeTime(alert.createdAt)}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-[var(--text-1)]">{alert.title}</p>
                <p className="text-[13px] text-[var(--text-2)] mt-0.5">{alert.message}</p>
                {alert.sessionId && (
                  <a
                    href={`/sessions/${alert.sessionId}`}
                    className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium text-[var(--accent)] hover:underline"
                  >
                    View session <ExternalLink size={11} />
                  </a>
                )}
              </div>

              {alert.status === 'ACTIVE' && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleMarkRead(alert.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                    title="Mark as read"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `cd packages/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/alerts/page.tsx
git commit -m "feat(web): rewrite Alerts page with real-time alert feed

Replaces ComingSoon placeholder. Shows severity badges, type tags,
relative timestamps, session links. Filter by status and severity.
Mark read, dismiss, and bulk mark-all-read actions."
```

---

## Task 11: Insights Page

**Files:**
- Modify: `packages/web/src/app/insights/page.tsx`

- [ ] **Step 1: Rewrite Insights page**

Replace the entire contents of `packages/web/src/app/insights/page.tsx` with:

```typescript
'use client';

import { useState } from 'react';
import { Lightbulb, TrendingDown, BarChart3, Zap, DollarSign, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useInsights, dismissInsight, applyInsight } from '@/hooks/use-intelligence';
import { formatRelativeTime, formatCost } from '@/lib/format';
import type { InsightCategory, InsightStatus } from '@pulse/shared';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_CONFIG: Record<InsightCategory, { icon: LucideIcon; label: string; variant: 'green' | 'blue' | 'amber' | 'purple' }> = {
  COST_OPTIMIZATION: { icon: DollarSign, label: 'Cost Optimization', variant: 'green' },
  USAGE_PATTERN: { icon: BarChart3, label: 'Usage Pattern', variant: 'blue' },
  ANOMALY_TREND: { icon: Zap, label: 'Anomaly Trend', variant: 'amber' },
  PLAN_RECOMMENDATION: { icon: TrendingDown, label: 'Plan', variant: 'purple' },
};

export default function InsightsPage() {
  const { connected } = useWebSocket();
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<InsightStatus | ''>('ACTIVE');
  const { data, mutate } = useInsights({
    category: categoryFilter || undefined,
    status: statusFilter || undefined,
    limit: 50,
  });

  const insights = data?.insights ?? [];

  async function handleDismiss(id: string) {
    await dismissInsight(id);
    mutate();
  }

  async function handleApply(id: string) {
    await applyInsight(id);
    mutate();
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Insights" subtitle="AI-powered recommendations based on your usage patterns" connected={connected} />

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <select
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | '')}
        >
          <option value="">All Categories</option>
          <option value="COST_OPTIMIZATION">Cost Optimization</option>
          <option value="USAGE_PATTERN">Usage Pattern</option>
          <option value="ANOMALY_TREND">Anomaly Trend</option>
          <option value="PLAN_RECOMMENDATION">Plan</option>
        </select>

        <select
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InsightStatus | '')}
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="APPLIED">Applied</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      {/* Insight cards */}
      <div className="mt-4 space-y-3">
        {insights.length === 0 && (
          <div className="text-center py-16 text-[var(--text-3)]">
            <Lightbulb size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-[15px] font-medium">No insights yet</p>
            <p className="text-[13px] mt-1">Pulse is analyzing your usage patterns. Insights will appear here.</p>
          </div>
        )}

        {insights.map((insight) => {
          const config = CATEGORY_CONFIG[insight.category];
          const Icon = config.icon;
          const impact = insight.impact as Record<string, unknown>;

          return (
            <div
              key={insight.id}
              className={`rounded-[16px] border bg-[var(--surface)] overflow-hidden transition-colors ${
                insight.status === 'ACTIVE'
                  ? 'border-[var(--border)]'
                  : 'border-[var(--border-light)] opacity-60'
              }`}
            >
              <div className="flex">
                {/* Left accent bar */}
                <div
                  className="w-1 shrink-0"
                  style={{ background: 'linear-gradient(to bottom, var(--accent), var(--accent-dark))' }}
                />

                <div className="flex-1 p-4">
                  <div className="flex items-start gap-3">
                    <div className={`size-8 rounded-[8px] flex items-center justify-center shrink-0 bg-[var(--${config.variant}-bg)]`}>
                      <Icon size={16} className={`text-[var(--${config.variant})]`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatTag variant={config.variant}>{config.label}</StatTag>
                        {impact.estimatedSavings && (
                          <StatTag variant="green">Save {formatCost(impact.estimatedSavings as number)}/wk</StatTag>
                        )}
                        {impact.percentChange && (
                          <StatTag variant="amber">{impact.percentChange}% change</StatTag>
                        )}
                        <span className="text-[11px] text-[var(--text-3)]">
                          {formatRelativeTime(insight.createdAt)}
                        </span>
                      </div>

                      <p className="text-[14px] font-semibold text-[var(--text-1)]">{insight.title}</p>
                      <p className="text-[13px] text-[var(--text-2)] mt-0.5">{insight.description}</p>

                      {insight.status === 'ACTIVE' && (
                        <div className="flex items-center gap-2 mt-3">
                          {(insight.metadata as Record<string, unknown>).suggestedRule && (
                            <button
                              onClick={() => handleApply(insight.id)}
                              className="inline-flex items-center gap-1.5 rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-3 py-1.5 text-[12px] font-semibold text-white"
                            >
                              <Check size={12} /> Apply
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(insight.id)}
                            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-hover)]"
                          >
                            <X size={12} /> Dismiss
                          </button>
                        </div>
                      )}

                      {insight.status === 'APPLIED' && (
                        <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[var(--green)] font-medium">
                          <Check size={12} /> Applied {insight.appliedAt ? formatRelativeTime(insight.appliedAt) : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `cd packages/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/insights/page.tsx
git commit -m "feat(web): rewrite Insights page with categorized insight cards

Replaces ComingSoon placeholder. Shows insights grouped by category
with icons, impact badges, Apply/Dismiss actions. Category and status
filters. Apply auto-creates rules for COST_OPTIMIZATION insights."
```

---

## Task 12: Rules Page

**Files:**
- Modify: `packages/web/src/app/rules/page.tsx`

- [ ] **Step 1: Rewrite Rules page**

Replace the entire contents of `packages/web/src/app/rules/page.tsx` with:

```typescript
'use client';

import { useState } from 'react';
import { ShieldCheck, Plus, Trash2, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useRules, toggleRule, createRule, deleteRule } from '@/hooks/use-intelligence';
import { formatRelativeTime } from '@/lib/format';
import type { RuleType, RuleAction, Rule } from '@pulse/shared';

const RULE_TYPE_LABEL: Record<RuleType, string> = {
  COST_CAP_SESSION: 'Session Cost Cap',
  COST_CAP_DAILY: 'Daily Cost Cap',
  COST_CAP_PROJECT: 'Project Cost Cap',
  MODEL_RESTRICTION: 'Model Restriction',
  BURN_RATE_LIMIT: 'Burn Rate Limit',
  SESSION_DURATION: 'Session Duration',
};

const ACTION_VARIANT: Record<RuleAction, 'blue' | 'amber' | 'red'> = {
  ALERT: 'blue',
  PAUSE: 'amber',
  BLOCK: 'red',
};

export default function RulesPage() {
  const { connected } = useWebSocket();
  const { data: rules, mutate } = useRules();
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<RuleType>('COST_CAP_SESSION');
  const [formAction, setFormAction] = useState<RuleAction>('ALERT');
  const [formGlobal, setFormGlobal] = useState(true);
  const [formProject, setFormProject] = useState('');
  const [formMaxCost, setFormMaxCost] = useState('50');
  const [formMaxRate, setFormMaxRate] = useState('10000');
  const [formMaxMinutes, setFormMaxMinutes] = useState('120');
  const [formAllowedModels, setFormAllowedModels] = useState('claude-sonnet-4-6');
  const [formPeriod, setFormPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  async function handleToggle(id: string) {
    await toggleRule(id);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return;
    await deleteRule(id);
    mutate();
  }

  async function handleCreate() {
    const scope = formGlobal ? { global: true } : { projectName: formProject };

    let condition: Record<string, unknown> = {};
    if (formType === 'COST_CAP_SESSION' || formType === 'COST_CAP_DAILY') {
      condition = { maxCost: parseFloat(formMaxCost) };
    } else if (formType === 'COST_CAP_PROJECT') {
      condition = { maxCost: parseFloat(formMaxCost), period: formPeriod };
    } else if (formType === 'MODEL_RESTRICTION') {
      condition = { allowedModels: formAllowedModels.split(',').map((m) => m.trim()) };
    } else if (formType === 'BURN_RATE_LIMIT') {
      condition = { maxRate: parseInt(formMaxRate) };
    } else if (formType === 'SESSION_DURATION') {
      condition = { maxMinutes: parseInt(formMaxMinutes) };
    }

    await createRule({ name: formName, type: formType, scope, condition, action: formAction });
    setShowCreate(false);
    setFormName('');
    mutate();
  }

  function scopeDescription(rule: Rule): string {
    const scope = rule.scope as Record<string, unknown>;
    if (scope.global) return 'Global';
    if (scope.projectName) return `Project: ${scope.projectName}`;
    if (scope.sessionType) return `Type: ${scope.sessionType}`;
    return 'Unknown scope';
  }

  function conditionDescription(rule: Rule): string {
    const cond = rule.condition as Record<string, unknown>;
    if (cond.maxCost) return `$${cond.maxCost}${cond.period ? ` / ${cond.period}` : ''}`;
    if (cond.allowedModels) return `Models: ${(cond.allowedModels as string[]).join(', ')}`;
    if (cond.maxRate) return `${cond.maxRate} tok/min`;
    if (cond.maxMinutes) return `${cond.maxMinutes} min`;
    return '';
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Rules" subtitle="Governance rules for cost caps, model restrictions, and session limits" connected={connected}>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
        >
          <Plus size={14} /> Create Rule
        </button>
      </PageHeader>

      {/* Create modal */}
      {showCreate && (
        <div className="mt-6 rounded-[16px] border border-[var(--accent-border)] bg-[var(--surface)] p-5 space-y-4">
          <h3 className="text-[15px] font-bold text-[var(--text-1)]">New Rule</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Name</label>
              <input className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Daily cost cap" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Type</label>
              <select className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formType} onChange={(e) => setFormType(e.target.value as RuleType)}>
                {Object.entries(RULE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Action</label>
              <select className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formAction} onChange={(e) => setFormAction(e.target.value as RuleAction)}>
                <option value="ALERT">Alert Only</option>
                <option value="PAUSE">Pause Session</option>
                <option value="BLOCK">Block (Flag)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Scope</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" checked={formGlobal} onChange={(e) => setFormGlobal(e.target.checked)} /> Global
                </label>
                {!formGlobal && (
                  <input className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formProject} onChange={(e) => setFormProject(e.target.value)} placeholder="Project name" />
                )}
              </div>
            </div>
          </div>

          {/* Condition fields (dynamic by type) */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">Condition</label>
            {(formType === 'COST_CAP_SESSION' || formType === 'COST_CAP_DAILY') && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-2)]">Max cost $</span>
                <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxCost} onChange={(e) => setFormMaxCost(e.target.value)} />
              </div>
            )}
            {formType === 'COST_CAP_PROJECT' && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-2)]">Max cost $</span>
                <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxCost} onChange={(e) => setFormMaxCost(e.target.value)} />
                <span className="text-[13px] text-[var(--text-2)]">per</span>
                <select className="rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formPeriod} onChange={(e) => setFormPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                </select>
              </div>
            )}
            {formType === 'MODEL_RESTRICTION' && (
              <input className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" value={formAllowedModels} onChange={(e) => setFormAllowedModels(e.target.value)} placeholder="claude-sonnet-4-6, claude-haiku-4-5" />
            )}
            {formType === 'BURN_RATE_LIMIT' && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-2)]">Max rate</span>
                <input className="w-28 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxRate} onChange={(e) => setFormMaxRate(e.target.value)} />
                <span className="text-[13px] text-[var(--text-2)]">tok/min</span>
              </div>
            )}
            {formType === 'SESSION_DURATION' && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--text-2)]">Max duration</span>
                <input className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]" type="number" value={formMaxMinutes} onChange={(e) => setFormMaxMinutes(e.target.value)} />
                <span className="text-[13px] text-[var(--text-2)]">minutes</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-[8px] border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)]">Cancel</button>
            <button onClick={handleCreate} disabled={!formName} className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Create</button>
          </div>
        </div>
      )}

      {/* Rule cards */}
      <div className="mt-6 space-y-2">
        {(!rules || rules.length === 0) && !showCreate && (
          <div className="text-center py-16 text-[var(--text-3)]">
            <ShieldCheck size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-[15px] font-medium">No rules configured</p>
            <p className="text-[13px] mt-1">Create rules to set cost caps, model restrictions, and session limits</p>
          </div>
        )}

        {rules?.map((rule) => (
          <div
            key={rule.id}
            className={`rounded-[16px] border bg-[var(--surface)] p-4 ${
              rule.enabled ? 'border-[var(--border)]' : 'border-[var(--border-light)] opacity-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() => handleToggle(rule.id)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  rule.enabled ? 'bg-[var(--green)]' : 'bg-[var(--border)]'
                }`}
              >
                <div className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                  rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[var(--text-1)]">{rule.name}</span>
                  <StatTag variant="neutral">{RULE_TYPE_LABEL[rule.type]}</StatTag>
                  <StatTag variant={ACTION_VARIANT[rule.action]}>{rule.action}</StatTag>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[12px] text-[var(--text-3)]">
                  <span>{scopeDescription(rule)}</span>
                  <span className="text-[var(--border)]">|</span>
                  <span>{conditionDescription(rule)}</span>
                  {rule.triggerCount > 0 && (
                    <>
                      <span className="text-[var(--border)]">|</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        Triggered {rule.triggerCount}x
                        {rule.lastTriggeredAt && ` · ${formatRelativeTime(rule.lastTriggeredAt)}`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDelete(rule.id)}
                className="p-1.5 rounded-lg hover:bg-[var(--red-bg)] text-[var(--text-3)] hover:text-[var(--red)]"
                title="Delete rule"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `cd packages/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/rules/page.tsx
git commit -m "feat(web): rewrite Rules page with CRUD management

Replaces ComingSoon placeholder. Rule cards with toggle switches,
type/action badges, trigger counts. Inline create form with dynamic
condition fields per rule type. Delete with confirmation."
```

---

## Task 13: Settings Webhooks + Dashboard Integration

**Files:**
- Modify: `packages/web/src/app/settings/page.tsx`
- Modify: `packages/web/src/app/page.tsx`

- [ ] **Step 1: Add Webhooks section to Settings page**

In `packages/web/src/app/settings/page.tsx`, this task adds a Webhooks section after the Notifications section. The full page needs to be updated to import the new hooks and add the webhook management UI. Read the current file contents, then add imports for `useWebhooks`, `createWebhook`, `deleteWebhook`, `testWebhook` from `@/hooks/use-intelligence`. Add a Webhooks section with:

- Webhook list showing name, URL (truncated to 40 chars), event badges, enabled status
- "Add Webhook" button opening an inline form: name, URL, secret (optional), event checkboxes
- Per-webhook "Test" button showing success/failure feedback
- Per-webhook "Delete" button
- Disabled webhooks show "Auto-disabled" with re-enable option

This is a settings page enhancement — follow the existing `Section` / `Row` component pattern already in the file.

- [ ] **Step 2: Update Dashboard to use real insights**

In `packages/web/src/app/page.tsx`, replace the static mock InsightCard with real insight data from the API. Import `useInsights`, `dismissInsight`, `applyInsight` from `@/hooks/use-intelligence`. Replace the static InsightCard (around line 88-96) with:

```typescript
// Replace the existing mock InsightCard with:
const { data: insightData } = useInsights({ status: 'ACTIVE', limit: 1 });
const latestInsight = insightData?.insights?.[0];

// In the JSX, replace the static InsightCard with:
{latestInsight && (
  <InsightCard
    icon={Lightbulb}
    title={latestInsight.title}
    description={latestInsight.description}
    actionLabel={(latestInsight.metadata as Record<string, unknown>).suggestedRule ? 'Apply' : undefined}
    onAction={(latestInsight.metadata as Record<string, unknown>).suggestedRule ? () => applyInsight(latestInsight.id) : undefined}
    onDismiss={() => dismissInsight(latestInsight.id)}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/app/settings/page.tsx packages/web/src/app/page.tsx
git commit -m "feat(web): add Webhooks settings section, connect dashboard to real insights

Settings page gets Webhooks section with add/test/delete management.
Dashboard InsightCard now displays latest real insight from API
instead of static mock data."
```

---

## Task 14: Full Build + Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Build all packages**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build`
Expected: All 4 packages build successfully

- [ ] **Step 2: Run all tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Verify Prisma schema is in sync**

Run: `cd packages/api && npx prisma db push --accept-data-loss`
Expected: Schema in sync

- [ ] **Step 4: Fix any TypeScript errors**

If the build in Step 1 produced errors, fix them and commit fixes.

- [ ] **Step 5: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve build issues from intelligence engine integration"
```
