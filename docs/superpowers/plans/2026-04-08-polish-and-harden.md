# Polish & Harden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all code review issues from the Intelligence Engine, fill spec gaps, and expand test coverage.

**Architecture:** No new packages or dependencies. All changes are within `@pulse/api`. Create a shared Prisma singleton, harden route inputs, add webhook retry, Redis-cache project costs, add two missing anomaly/insight features, and write missing tests.

**Tech Stack:** Express 5, Prisma 6, ioredis, node-cron v4, Vitest

---

### Task 1: Shared PrismaClient Singleton

Create a single shared Prisma instance and update all files to use it.

**Files:**
- Create: `packages/api/src/services/prisma.ts`
- Modify: `packages/api/src/services/session-service.ts`
- Modify: `packages/api/src/services/intelligence/alert-manager.ts`
- Modify: `packages/api/src/services/intelligence/rule-engine.ts`
- Modify: `packages/api/src/services/intelligence/insight-generator.ts`
- Modify: `packages/api/src/services/intelligence/webhook-service.ts`
- Modify: `packages/api/src/routes/rules.ts`
- Modify: `packages/api/src/routes/webhooks.ts`
- Modify: `packages/api/src/routes/insights.ts`

**Context:** Currently 9 files create their own `new PrismaClient()`. The `alerts.ts` route and `dashboard.ts`/`sessions.ts`/`health.ts` routes don't directly use Prisma (they use service methods), so they need no changes.

- [ ] **Step 1: Create the shared Prisma module**

Create `packages/api/src/services/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 2: Update session-service.ts**

Replace the first two lines:

```typescript
// REMOVE:
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();

// REPLACE WITH:
import { prisma } from './prisma.js';
```

Keep `import { publishTokenEvent, publishSessionUpdate } from './redis.js';` — only remove the PrismaClient import and `const prisma` line.

- [ ] **Step 3: Update alert-manager.ts**

Replace:
```typescript
import { PrismaClient, Prisma } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.js';
```

Note: Keep the `Prisma` namespace import (used for `Prisma.InputJsonValue`). The path is `../services/prisma.js` since alert-manager is in `services/intelligence/`.

- [ ] **Step 4: Update rule-engine.ts**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 5: Update insight-generator.ts**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 6: Update webhook-service.ts**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 7: Update rules.ts route**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 8: Update webhooks.ts route**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 9: Update insights.ts route**

Replace:
```typescript
import { PrismaClient } from '@prisma/client';
// ...
const prisma = new PrismaClient();
```

With:
```typescript
import { prisma } from '../services/prisma.js';
```

- [ ] **Step 10: Update test mocks**

All existing tests mock `@prisma/client` with `vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }))`. Now we also need to mock the shared module. In each test file that currently mocks `@prisma/client`, add an additional mock:

```typescript
vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));
```

Add this to: `alert-manager.test.ts`, `rule-engine.test.ts`, `insight-generator.test.ts`, `webhook-service.test.ts`.

Keep the existing `@prisma/client` mock too (some files still import types from it like `Prisma`).

- [ ] **Step 11: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass, no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add packages/api/src/services/prisma.ts packages/api/src/services/session-service.ts packages/api/src/services/intelligence/alert-manager.ts packages/api/src/services/intelligence/rule-engine.ts packages/api/src/services/intelligence/insight-generator.ts packages/api/src/services/intelligence/webhook-service.ts packages/api/src/routes/rules.ts packages/api/src/routes/webhooks.ts packages/api/src/routes/insights.ts packages/api/tests/alert-manager.test.ts packages/api/tests/rule-engine.test.ts packages/api/tests/insight-generator.test.ts packages/api/tests/webhook-service.test.ts
git commit -m "refactor(api): extract shared PrismaClient singleton"
```

---

### Task 2: Webhook Retry with Exponential Backoff

Add async retry logic to `WebhookService.deliver()` with 3 attempts and exponential backoff.

**Files:**
- Modify: `packages/api/src/services/intelligence/webhook-service.ts`

**Context:** Current implementation makes a single attempt and increments `failCount` on any failure. New behavior: fire-and-forget async delivery, retry transient failures (5xx/network errors), stop immediately on 4xx, increment `failCount` only after all retries exhausted.

- [ ] **Step 1: Rewrite webhook-service.ts**

Replace the entire content of `packages/api/src/services/intelligence/webhook-service.ts` with:

```typescript
import { createHmac } from 'crypto';
import { prisma } from '../services/prisma.js';
import type { Alert } from '@pulse/shared';

const MAX_FAIL_COUNT = 5;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const MAX_ATTEMPTS = 3;

class WebhookService {
  async dispatch(alert: Alert): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        enabled: true,
        events: { has: alert.type },
      },
    });

    for (const wh of webhooks) {
      // Fire-and-forget: don't await delivery
      this.deliverWithRetry(wh, alert).catch(() => {});
    }
  }

  private async deliverWithRetry(
    webhook: { id: string; url: string; secret: string | null; failCount: number },
    alert: Alert,
  ): Promise<void> {
    const payload = this.buildPayload(alert);
    const headers = this.buildHeaders(payload, webhook.secret);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          // Success — reset failure tracking
          await prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastSentAt: new Date(), failCount: 0, lastError: null },
          });
          return;
        }

        // 4xx = client error, don't retry
        if (res.status >= 400 && res.status < 500) {
          await this.recordFailure(webhook, `HTTP ${res.status}`);
          return;
        }

        // 5xx = server error, retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          await this.delay(RETRY_DELAYS[attempt - 1]);
          continue;
        }

        // Final attempt failed
        await this.recordFailure(webhook, `HTTP ${res.status}`);
      } catch (err) {
        // Network error — retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          await this.delay(RETRY_DELAYS[attempt - 1]);
          continue;
        }

        // Final attempt failed
        await this.recordFailure(webhook, (err as Error).message);
      }
    }
  }

  private buildPayload(alert: Alert): string {
    return JSON.stringify({
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
  }

  private buildHeaders(payload: string, secret: string | null): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) {
      headers['X-Pulse-Signature'] = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    }
    return headers;
  }

  private async recordFailure(
    webhook: { id: string; failCount: number },
    error: string,
  ): Promise<void> {
    const newFailCount = webhook.failCount + 1;
    await prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        failCount: { increment: 1 },
        lastError: error,
        ...(newFailCount >= MAX_FAIL_COUNT ? { enabled: false } : {}),
      },
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

- [ ] **Step 2: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: Existing webhook tests still pass (they test `dispatch` which now calls `deliverWithRetry` internally). Some may need adjustment if they previously asserted on `Promise.allSettled` behavior.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/intelligence/webhook-service.ts
git commit -m "fix(api): add webhook retry with exponential backoff (3 attempts)"
```

---

### Task 3: Route Input Validation

Add manual validation guard clauses to all body-accepting route handlers.

**Files:**
- Modify: `packages/api/src/routes/rules.ts`
- Modify: `packages/api/src/routes/webhooks.ts`
- Modify: `packages/api/src/routes/alerts.ts`

**Context:** Currently `rules.ts` POST/PUT pass `req.body` directly to Prisma, allowing clients to set `triggerCount`, `enabled`, etc. Same with webhooks. Alert batch routes don't validate `req.body.ids` is an array.

- [ ] **Step 1: Rewrite rules.ts with validation**

Replace the entire content of `packages/api/src/routes/rules.ts` with:

```typescript
import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';
import type { RuleType, RuleAction } from '@pulse/shared';

export const rulesRouter: IRouter = Router();

const VALID_RULE_TYPES: RuleType[] = [
  'COST_CAP_SESSION', 'COST_CAP_DAILY', 'COST_CAP_PROJECT',
  'MODEL_RESTRICTION', 'BURN_RATE_LIMIT', 'SESSION_DURATION',
];
const VALID_RULE_ACTIONS: RuleAction[] = ['ALERT', 'PAUSE', 'BLOCK'];

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
    const { name, type, scope, condition, action } = req.body;

    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name is required (string)' }); return; }
    if (!VALID_RULE_TYPES.includes(type)) { res.status(400).json({ error: `type must be one of: ${VALID_RULE_TYPES.join(', ')}` }); return; }
    if (!scope || typeof scope !== 'object') { res.status(400).json({ error: 'scope is required (object)' }); return; }
    if (!condition || typeof condition !== 'object') { res.status(400).json({ error: 'condition is required (object)' }); return; }
    if (!VALID_RULE_ACTIONS.includes(action)) { res.status(400).json({ error: `action must be one of: ${VALID_RULE_ACTIONS.join(', ')}` }); return; }

    const rule = await prisma.rule.create({
      data: { name, type, scope, condition, action },
    });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.put('/:id', async (req, res) => {
  try {
    const { name, type, scope, condition, action } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string') { res.status(400).json({ error: 'name must be a string' }); return; }
      data.name = name;
    }
    if (type !== undefined) {
      if (!VALID_RULE_TYPES.includes(type)) { res.status(400).json({ error: `type must be one of: ${VALID_RULE_TYPES.join(', ')}` }); return; }
      data.type = type;
    }
    if (scope !== undefined) {
      if (typeof scope !== 'object') { res.status(400).json({ error: 'scope must be an object' }); return; }
      data.scope = scope;
    }
    if (condition !== undefined) {
      if (typeof condition !== 'object') { res.status(400).json({ error: 'condition must be an object' }); return; }
      data.condition = condition;
    }
    if (action !== undefined) {
      if (!VALID_RULE_ACTIONS.includes(action)) { res.status(400).json({ error: `action must be one of: ${VALID_RULE_ACTIONS.join(', ')}` }); return; }
      data.action = action;
    }

    const rule = await prisma.rule.update({ where: { id: req.params.id }, data });
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

- [ ] **Step 2: Rewrite webhooks.ts with validation**

Replace the entire content of `packages/api/src/routes/webhooks.ts` with:

```typescript
import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';
import { webhookService } from '../services/intelligence/webhook-service.js';
import type { AlertType } from '@pulse/shared';

export const webhooksRouter: IRouter = Router();

const VALID_EVENT_TYPES: AlertType[] = ['RULE_BREACH', 'ANOMALY', 'INSIGHT', 'SYSTEM'];

webhooksRouter.get('/', async (_req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
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
    const { name, url, events, secret } = req.body;

    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name is required (string)' }); return; }
    if (!url || typeof url !== 'string') { res.status(400).json({ error: 'url is required (string)' }); return; }
    try { new URL(url); } catch { res.status(400).json({ error: 'url must be a valid URL' }); return; }
    if (!Array.isArray(events) || events.length === 0) { res.status(400).json({ error: 'events must be a non-empty array' }); return; }
    if (!events.every((e: string) => VALID_EVENT_TYPES.includes(e as AlertType))) {
      res.status(400).json({ error: `events must contain only: ${VALID_EVENT_TYPES.join(', ')}` }); return;
    }

    const data: Record<string, unknown> = { name, url, events };
    if (secret && typeof secret === 'string') data.secret = secret;

    const webhook = await prisma.webhook.create({ data: data as any });
    res.status(201).json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.put('/:id', async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string') { res.status(400).json({ error: 'name must be a string' }); return; }
      data.name = name;
    }
    if (url !== undefined) {
      if (typeof url !== 'string') { res.status(400).json({ error: 'url must be a string' }); return; }
      try { new URL(url); } catch { res.status(400).json({ error: 'url must be a valid URL' }); return; }
      data.url = url;
    }
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) { res.status(400).json({ error: 'events must be a non-empty array' }); return; }
      if (!events.every((e: string) => VALID_EVENT_TYPES.includes(e as AlertType))) {
        res.status(400).json({ error: `events must contain only: ${VALID_EVENT_TYPES.join(', ')}` }); return;
      }
      data.events = events;
    }
    if (secret !== undefined) {
      if (typeof secret !== 'string') { res.status(400).json({ error: 'secret must be a string' }); return; }
      data.secret = secret;
    }

    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: data as any });
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

- [ ] **Step 3: Add batch validation to alerts.ts**

In `packages/api/src/routes/alerts.ts`, add a comment above `GET /unread-count` and add validation to the batch routes. Replace the batch handlers and add the comment:

Add this comment before the `/unread-count` route (line 23):
```typescript
// IMPORTANT: /unread-count must be registered before /:id to avoid Express capturing "unread-count" as an id param
```

Replace the `PUT /batch/read` handler:
```typescript
alertsRouter.put('/batch/read', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of strings' }); return;
    }
    await alertManager.batchMarkRead(ids);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

Replace the `PUT /batch/dismiss` handler:
```typescript
alertsRouter.put('/batch/dismiss', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of strings' }); return;
    }
    await alertManager.batchDismiss(ids);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 4: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/rules.ts packages/api/src/routes/webhooks.ts packages/api/src/routes/alerts.ts
git commit -m "fix(api): add input validation to rules, webhooks, and alerts routes"
```

---

### Task 4: Redis Cache for COST_CAP_PROJECT

Add Redis-cached running totals for project cost aggregation and wire it into the token event flow.

**Files:**
- Modify: `packages/api/src/services/intelligence/rule-engine.ts`
- Modify: `packages/api/src/ws-server.ts`

**Context:** `checkCostCapProject` currently hits Prisma on every token event. We need to: (1) cache project costs in Redis, (2) increment on each token event from ws-server, (3) read from Redis in rule-engine with DB fallback, (4) write back to Redis on cache miss.

- [ ] **Step 1: Update ws-server.ts to increment project cost in Redis**

In `packages/api/src/ws-server.ts`, in the `token_event` handler, after the line `redis.incrbyfloat('pulse:daily_cost', d.costDeltaUsd as number).catch(() => {});`, add:

```typescript
    // Increment project cost counter in Redis
    const projectSlug = d.projectSlug as string;
    if (projectSlug) {
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:daily`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:weekly`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:monthly`, d.costDeltaUsd as number).catch(() => {});
    }
```

- [ ] **Step 2: Rewrite checkCostCapProject in rule-engine.ts**

Replace the `checkCostCapProject` method with:

```typescript
  private async checkCostCapProject(rule: CachedRule, session: SessionContext): Promise<RuleViolation | null> {
    const maxCost = rule.condition.maxCost ?? Infinity;
    const period = rule.condition.period ?? 'daily';
    const cacheKey = `pulse:project_cost:${session.projectSlug}:${period}`;

    let projectCost = 0;

    // Try Redis cache first
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      projectCost = parseFloat(cached);
    } else {
      // Fall back to DB aggregation
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
      projectCost = result._sum.costUsd ?? 0;

      // Write back to Redis for subsequent evaluations
      const ttl = period === 'monthly' ? 31 * 86400 : period === 'weekly' ? 7 * 86400 : 86400;
      await redis.set(cacheKey, projectCost.toString(), 'EX', ttl).catch(() => {});
    }

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
```

- [ ] **Step 3: Add Redis write-back to checkCostCapDaily**

In `rule-engine.ts`, in the `checkCostCapDaily` method, after the DB fallback query (`todayCost = result._sum.costUsd ?? 0;`), add:

```typescript
      // Write back to Redis for subsequent evaluations
      await redis.set('pulse:daily_cost', todayCost.toString(), 'EX', 86400).catch(() => {});
```

- [ ] **Step 4: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/rule-engine.ts packages/api/src/ws-server.ts
git commit -m "fix(api): add Redis cache for COST_CAP_PROJECT + write-back for COST_CAP_DAILY"
```

---

### Task 5: Scheduler Midnight Reset + Session Cleanup

Fix the midnight cost reset to use node-cron and add session history cleanup on WebSocket disconnect.

**Files:**
- Modify: `packages/api/src/services/intelligence/scheduler.ts`
- Modify: `packages/api/src/ws-server.ts`

**Context:** The scheduler uses a fragile `setInterval` + time check for midnight reset. The ws-server doesn't call `anomalyDetector.clearSession()` on WebSocket disconnect.

- [ ] **Step 1: Fix scheduler midnight reset**

In `packages/api/src/services/intelligence/scheduler.ts`, replace the midnight interval block (the 4th `this.intervals.push` block, lines 38-45):

```typescript
    // Every midnight UTC: reset daily cost counter
    this.intervals.push(
      setInterval(() => {
        const now = new Date();
        if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
          redis.del('pulse:daily_cost').catch(() => {});
        }
      }, 60_000),
    );
```

Replace with a node-cron job:

```typescript
    // Midnight UTC: reset daily cost counter
    const midnightJob = cron.schedule('0 0 * * *', () => {
      redis.del('pulse:daily_cost').catch(() => {});
    }, { timezone: 'UTC' });
    this.cronJobs.push(midnightJob);
```

- [ ] **Step 2: Add session cleanup on WebSocket disconnect**

In `packages/api/src/ws-server.ts`, in the `ws.on('close')` handler, add `anomalyDetector.clearSession()` calls. Replace the existing close handler:

```typescript
    ws.on('close', () => {
      // Clean up session registry entries for this connection
      for (const [sessionId, socket] of sessionRegistry) {
        if (socket === ws) {
          sessionRegistry.delete(sessionId);
          // Prevent unbounded session history growth
          anomalyDetector.clearSession(sessionId);
        }
      }
    });
```

- [ ] **Step 3: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/intelligence/scheduler.ts packages/api/src/ws-server.ts
git commit -m "fix(api): use node-cron for midnight reset, clean up session history on disconnect"
```

---

### Task 6: applyInsight Type Safety

Replace the `as any` cast in `InsightGenerator.applyInsight()` with explicit field extraction and validation.

**Files:**
- Modify: `packages/api/src/services/intelligence/insight-generator.ts`

**Context:** The current `applyInsight` casts the entire rule creation data as `any`. This should validate that `suggestedRule` has all required fields before creating.

- [ ] **Step 1: Replace the applyInsight method**

In `packages/api/src/services/intelligence/insight-generator.ts`, replace the `applyInsight` method (lines 240-268) with:

```typescript
  /** Apply an insight — creates associated rule if applicable */
  async applyInsight(insightId: string): Promise<{ insight: Insight; ruleId?: string }> {
    const insight = await prisma.insight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');

    let ruleId: string | undefined;

    // Auto-create rule if insight has suggestedRule metadata
    const metadata = insight.metadata as Record<string, unknown>;
    if (insight.category === 'COST_OPTIMIZATION' && metadata.suggestedRule) {
      const suggested = metadata.suggestedRule as Record<string, unknown>;

      // Validate required fields
      const type = suggested.type as string | undefined;
      const scope = suggested.scope as object | undefined;
      const condition = suggested.condition as object | undefined;
      const action = suggested.action as string | undefined;

      if (!type || !scope || !condition || !action) {
        throw new Error('suggestedRule metadata is missing required fields (type, scope, condition, action)');
      }

      const rule = await prisma.rule.create({
        data: {
          name: `Auto: ${insight.title}`,
          type,
          scope,
          condition,
          action,
        },
      });
      ruleId = rule.id;
    }

    const updated = await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });

    return { insight: updated as unknown as Insight, ruleId };
  }
```

- [ ] **Step 2: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/intelligence/insight-generator.ts
git commit -m "fix(api): replace 'as any' in applyInsight with field validation"
```

---

### Task 7: Abnormal Termination Cluster Detection

Add `checkAbnormalTerminations()` to `AnomalyDetector` for detecting session crash clusters.

**Files:**
- Modify: `packages/api/src/services/intelligence/anomaly-detector.ts`
- Modify: `packages/api/src/ws-server.ts`

**Context:** The spec requires detecting 3+ abnormal session ends within 1 hour as a CRITICAL anomaly. We need a sliding window of abnormal termination timestamps.

- [ ] **Step 1: Add abnormal termination tracking to anomaly-detector.ts**

In `packages/api/src/services/intelligence/anomaly-detector.ts`, add a new property to the class after `private sessionHistory`:

```typescript
  private abnormalTerminations: { timestamp: number; sessionId: string }[] = [];
```

Add a new public method after the `clearSession` method:

```typescript
  /** Check for abnormal termination cluster. Called on session_end. */
  checkAbnormalTerminations(sessionId: string, endReason?: string): Anomaly | null {
    // Only track non-normal endings
    const normalReasons = ['completed', 'user_stopped'];
    if (endReason && normalReasons.includes(endReason)) return null;
    // If no endReason provided, treat as abnormal (unexpected disconnect)

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Add this termination
    this.abnormalTerminations.push({ timestamp: now, sessionId });

    // Prune entries older than 1 hour
    this.abnormalTerminations = this.abnormalTerminations.filter((t) => t.timestamp > oneHourAgo);

    // Check threshold: 3+ abnormal terminations in 1 hour
    if (this.abnormalTerminations.length >= 3) {
      const sessionIds = this.abnormalTerminations.map((t) => t.sessionId);
      // Reset to avoid repeated firing
      this.abnormalTerminations = [];

      return {
        type: 'abnormal_termination_cluster',
        severity: 'CRITICAL',
        title: 'Abnormal termination cluster detected',
        message: `${sessionIds.length} sessions ended abnormally within 1 hour`,
        sessionId,
        metadata: { sessionIds, count: sessionIds.length },
      };
    }

    return null;
  }
```

Update the `_resetForTest` method to also clear the new array:

```typescript
  _resetForTest(): void {
    this.baselineStats.clear();
    this.sessionHistory.clear();
    this.abnormalTerminations = [];
  }
```

- [ ] **Step 2: Wire into ws-server.ts session_end handler**

In `packages/api/src/ws-server.ts`, in the `session_end` handler block (around line 154), add the abnormal termination check before the existing `endSession` call:

Replace:
```typescript
  } else if (msg.type === 'session_end') {
    const sessionId = msg.data.sessionId as string;
    sessionRegistry.delete(sessionId);
    anomalyDetector.clearSession(sessionId);
    await endSession(sessionId);
  }
```

With:
```typescript
  } else if (msg.type === 'session_end') {
    const sessionId = msg.data.sessionId as string;
    const endReason = msg.data.endReason as string | undefined;
    sessionRegistry.delete(sessionId);
    anomalyDetector.clearSession(sessionId);

    // Check for abnormal termination cluster
    const termAnomaly = anomalyDetector.checkAbnormalTerminations(sessionId, endReason);
    if (termAnomaly) {
      await alertManager.create({
        type: 'ANOMALY',
        severity: termAnomaly.severity,
        title: termAnomaly.title,
        message: termAnomaly.message,
        sessionId: termAnomaly.sessionId,
        metadata: termAnomaly.metadata,
      }).catch(() => {});
    }

    await endSession(sessionId);
  }
```

- [ ] **Step 3: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/intelligence/anomaly-detector.ts packages/api/src/ws-server.ts
git commit -m "feat(api): add abnormal termination cluster detection (3+ in 1hr = CRITICAL)"
```

---

### Task 8: Peak Usage and Plan Recommendation Insights

Add `analyzePeakUsage()` and `analyzePlanRecommendation()` to `InsightGenerator`.

**Files:**
- Modify: `packages/api/src/services/intelligence/insight-generator.ts`

**Context:** Two insight types from the spec are missing. Both run in the existing 5-minute batch cycle. They query sessions grouped by hour / total monthly spend.

- [ ] **Step 1: Add analyzePeakUsage method**

In `packages/api/src/services/intelligence/insight-generator.ts`, add after the `analyzeCostTrends` method:

```typescript
  /** Detect peak usage concentration in a narrow time window */
  private async analyzePeakUsage(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const sessions = await prisma.session.findMany({
      where: { startedAt: { gte: sevenDaysAgo } },
      select: { startedAt: true, costUsd: true },
    });

    if (sessions.length < 10) return insights; // Need enough data

    // Bucket costs by hour-of-day (0-23)
    const hourBuckets = new Array(24).fill(0);
    let totalCost = 0;
    for (const s of sessions) {
      const hour = new Date(s.startedAt).getUTCHours();
      hourBuckets[hour] += s.costUsd;
      totalCost += s.costUsd;
    }

    if (totalCost === 0) return insights;

    // Find the peak 4-hour window
    let maxWindowCost = 0;
    let peakStart = 0;
    for (let start = 0; start < 24; start++) {
      let windowCost = 0;
      for (let i = 0; i < 4; i++) {
        windowCost += hourBuckets[(start + i) % 24];
      }
      if (windowCost > maxWindowCost) {
        maxWindowCost = windowCost;
        peakStart = start;
      }
    }

    const concentration = maxWindowCost / totalCost;
    if (concentration < 0.6) return insights; // Only flag >60%

    const peakEnd = (peakStart + 4) % 24;
    const key = dedupKey('USAGE_PATTERN', { type: 'peak_usage', peakStart });

    const existing = await prisma.insight.findFirst({
      where: {
        dedupKey: key,
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return insights;

    const insight = await prisma.insight.create({
      data: {
        category: 'USAGE_PATTERN',
        title: `Peak usage ${peakStart}:00-${peakEnd}:00 UTC (${Math.round(concentration * 100)}% of spend)`,
        description: `${Math.round(concentration * 100)}% of your 7-day spend is concentrated in a 4-hour window. Consider scheduling batch agent work outside this window.`,
        impact: { percentChange: Math.round(concentration * 100) },
        metadata: { peakStart, peakEnd, concentration, totalCost },
        dedupKey: key,
      },
    });

    insights.push(insight as unknown as Insight);
    return insights;
  }
```

- [ ] **Step 2: Add analyzePlanRecommendation method**

Add after `analyzePeakUsage`:

```typescript
  /** Suggest plan upgrade/downgrade based on actual spend */
  private async analyzePlanRecommendation(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.session.aggregate({
      where: { startedAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true },
    });

    const monthlySpend = result._sum.costUsd ?? 0;
    if (monthlySpend === 0) return insights;

    // Plan tiers (simplified)
    const planCost = 100; // Current Max Plan
    const valueRatio = monthlySpend / planCost;

    let title: string | null = null;
    let description: string | null = null;

    if (valueRatio > 5) {
      title = `Getting ${valueRatio.toFixed(0)}x value from your plan`;
      description = `Your 30-day API spend of $${monthlySpend.toFixed(0)} represents ${valueRatio.toFixed(0)}x the value of your $${planCost}/mo plan. Great ROI!`;
    } else if (monthlySpend < planCost * 0.3) {
      title = `Low plan utilization ($${monthlySpend.toFixed(0)}/$${planCost} this month)`;
      description = `Your 30-day spend of $${monthlySpend.toFixed(0)} is only ${Math.round((monthlySpend / planCost) * 100)}% of your plan cost. Consider whether a lower tier would suffice.`;
    }

    if (!title) return insights;

    const key = dedupKey('PLAN_RECOMMENDATION', { type: 'plan_utilization', month: new Date().toISOString().slice(0, 7) });

    const existing = await prisma.insight.findFirst({
      where: {
        dedupKey: key,
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 7-day dedup window
      },
    });
    if (existing) return insights;

    const insight = await prisma.insight.create({
      data: {
        category: 'PLAN_RECOMMENDATION',
        title,
        description,
        impact: { percentChange: Math.round(valueRatio * 100) },
        metadata: { monthlySpend, planCost, valueRatio },
        dedupKey: key,
      },
    });

    insights.push(insight as unknown as Insight);
    return insights;
  }
```

- [ ] **Step 3: Wire new methods into analyze()**

In the `analyze()` method, add calls after the existing analyses:

```typescript
  async analyze(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const modelOptInsights = await this.analyzeModelOptimization();
    insights.push(...modelOptInsights);

    const spendInsights = await this.analyzeSpendDistribution();
    insights.push(...spendInsights);

    const costTrendInsights = await this.analyzeCostTrends();
    insights.push(...costTrendInsights);

    const peakInsights = await this.analyzePeakUsage();
    insights.push(...peakInsights);

    const planInsights = await this.analyzePlanRecommendation();
    insights.push(...planInsights);

    return insights;
  }
```

- [ ] **Step 4: Build and run tests**

Run: `cd packages/api && npx tsc --noEmit && cd ../.. && pnpm -r test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/insight-generator.ts
git commit -m "feat(api): add peak usage and plan recommendation insight analysis"
```

---

### Task 9: Service Test Coverage

Add tests for untested service paths: webhook retry, cost cap rules, insight methods, abnormal terminations.

**Files:**
- Modify: `packages/api/tests/webhook-service.test.ts`
- Modify: `packages/api/tests/rule-engine.test.ts`
- Modify: `packages/api/tests/insight-generator.test.ts`
- Modify: `packages/api/tests/anomaly-detector.test.ts`

**Context:** After Tasks 1-8, the services have new functionality that needs test coverage. All tests use the `vi.hoisted()` pattern and mock `@prisma/client` + `../src/services/prisma.js`.

- [ ] **Step 1: Add webhook retry tests**

In `packages/api/tests/webhook-service.test.ts`, add a new describe block after the existing `describe('test')` block (before the closing `});` of the outer describe):

```typescript
  describe('retry logic', () => {
    it('retries on 5xx and succeeds on second attempt', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      // First attempt: 500, second attempt: 200
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await webhookService.dispatch({
        id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString(),
      } as any);

      // Wait for async retry
      await new Promise((r) => setTimeout(r, 2000));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ failCount: 0 }),
      });
    });

    it('does not retry on 4xx errors', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockResolvedValue({ ok: false, status: 400 });

      await webhookService.dispatch({
        id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString(),
      } as any);

      // Wait briefly for async delivery
      await new Promise((r) => setTimeout(r, 500));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ failCount: { increment: 1 }, lastError: 'HTTP 400' }),
      });
    });

    it('increments failCount only after all retries exhausted', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await webhookService.dispatch({
        id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString(),
      } as any);

      // Wait for all 3 retries (1s + 5s + buffer)
      await new Promise((r) => setTimeout(r, 8000));

      expect(mockFetch).toHaveBeenCalledTimes(3);
      // failCount should be incremented exactly once (after all retries)
      expect(mockPrisma.webhook.update).toHaveBeenCalledTimes(1);
    }, 15000); // Extended timeout for retry delays
  });
```

Also add the prisma.js mock at the top of the file, after the existing mocks:

```typescript
vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));
```

- [ ] **Step 2: Add cost cap rule tests**

In `packages/api/tests/rule-engine.test.ts`, add a new describe block after `describe('scope matching')`:

```typescript
  describe('evaluate — COST_CAP_DAILY', () => {
    it('detects violation using Redis cached value', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r5', name: 'Daily cap', type: 'COST_CAP_DAILY', scope: { global: true }, condition: { maxCost: 200 }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue('250');

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'proj', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleType).toBe('COST_CAP_DAILY');
      expect(violations[0].severity).toBe('CRITICAL'); // 250 > 200*1.1
    });

    it('falls back to DB when Redis cache misses', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r5', name: 'Daily cap', type: 'COST_CAP_DAILY', scope: { global: true }, condition: { maxCost: 100 }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 150 } });

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'proj', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(mockPrisma.session.aggregate).toHaveBeenCalled();
    });
  });

  describe('evaluate — COST_CAP_PROJECT', () => {
    it('detects violation using Redis cached value', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r6', name: 'Project cap', type: 'COST_CAP_PROJECT', scope: { projectName: 'alpha' }, condition: { maxCost: 500, period: 'monthly' }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue('600');

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleType).toBe('COST_CAP_PROJECT');
    });

    it('falls back to DB and writes back to Redis on cache miss', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r6', name: 'Project cap', type: 'COST_CAP_PROJECT', scope: { projectName: 'alpha' }, condition: { maxCost: 500, period: 'weekly' }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 600 } });

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      // Verify Redis write-back
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pulse:project_cost:alpha:weekly',
        '600',
        'EX',
        7 * 86400,
      );
    });
  });
```

Also add the prisma.js mock at the top (like webhook test):

```typescript
vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));
```

- [ ] **Step 3: Add insight method tests**

In `packages/api/tests/insight-generator.test.ts`, add describe blocks after the existing `describe('deduplication')`:

```typescript
  describe('applyInsight', () => {
    it('creates rule from suggestedRule metadata', async () => {
      mockPrisma.insight.findUnique.mockResolvedValue({
        id: 'i1',
        category: 'COST_OPTIMIZATION',
        title: 'Switch "alpha" to Sonnet',
        metadata: {
          suggestedRule: {
            type: 'MODEL_RESTRICTION',
            scope: { projectName: 'alpha' },
            condition: { allowedModels: ['claude-sonnet-4-6'] },
            action: 'BLOCK',
          },
        },
      });
      mockPrisma.rule.create.mockResolvedValue({ id: 'rule-1' });
      mockPrisma.insight.update.mockResolvedValue({ id: 'i1', status: 'APPLIED' });

      const result = await insightGenerator.applyInsight('i1');

      expect(result.ruleId).toBe('rule-1');
      expect(mockPrisma.rule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Auto: Switch "alpha" to Sonnet',
          type: 'MODEL_RESTRICTION',
        }),
      });
    });

    it('throws when suggestedRule has missing fields', async () => {
      mockPrisma.insight.findUnique.mockResolvedValue({
        id: 'i2',
        category: 'COST_OPTIMIZATION',
        title: 'Broken insight',
        metadata: { suggestedRule: { type: 'MODEL_RESTRICTION' } }, // missing scope, condition, action
      });

      await expect(insightGenerator.applyInsight('i2')).rejects.toThrow('missing required fields');
    });
  });

  describe('weeklyDigest', () => {
    it('creates digest insight and alert', async () => {
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 450 }, _count: 85 });
      mockPrisma.alert.count.mockResolvedValue(12);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'digest-1', ...args.data }));

      const { alertManager } = await import('../src/services/intelligence/alert-manager.js');

      const insight = await insightGenerator.weeklyDigest();

      expect(insight).toBeDefined();
      expect(insight!.title).toContain('85 sessions');
      expect(insight!.title).toContain('$450');
      expect(alertManager.create).toHaveBeenCalled();
    });
  });
```

Also add the prisma.js mock at the top:

```typescript
vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));
```

- [ ] **Step 4: Add abnormal termination tests**

In `packages/api/tests/anomaly-detector.test.ts`, add a describe block after `describe('cost velocity')`:

```typescript
  describe('abnormal termination cluster', () => {
    it('fires CRITICAL after 3+ abnormal terminations in 1 hour', () => {
      anomalyDetector.checkAbnormalTerminations('s1', 'error');
      anomalyDetector.checkAbnormalTerminations('s2', 'timeout');
      const result = anomalyDetector.checkAbnormalTerminations('s3', 'crash');

      expect(result).toBeDefined();
      expect(result!.type).toBe('abnormal_termination_cluster');
      expect(result!.severity).toBe('CRITICAL');
    });

    it('does not fire for normal terminations', () => {
      anomalyDetector.checkAbnormalTerminations('s1', 'completed');
      anomalyDetector.checkAbnormalTerminations('s2', 'user_stopped');
      const result = anomalyDetector.checkAbnormalTerminations('s3', 'completed');

      expect(result).toBeNull();
    });

    it('does not fire with only 2 abnormal terminations', () => {
      anomalyDetector.checkAbnormalTerminations('s1', 'error');
      const result = anomalyDetector.checkAbnormalTerminations('s2', 'crash');

      expect(result).toBeNull();
    });
  });
```

- [ ] **Step 5: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`
Expected: All tests pass including new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/api/tests/webhook-service.test.ts packages/api/tests/rule-engine.test.ts packages/api/tests/insight-generator.test.ts packages/api/tests/anomaly-detector.test.ts
git commit -m "test(api): add coverage for retry logic, cost cap rules, insights, abnormal terminations"
```

---

### Task 10: Route Validation Tests + Full Build Verification

Add route-level tests for input validation and verify the complete build.

**Files:**
- Create: `packages/api/tests/routes/rules.test.ts`
- Create: `packages/api/tests/routes/alerts.test.ts`
- Create: `packages/api/tests/routes/webhooks.test.ts`

**Context:** Test that the validation guard clauses added in Task 3 correctly reject bad input and accept valid input. These tests import the route handlers directly and mock Prisma.

- [ ] **Step 1: Create route test directory**

Run: `mkdir -p packages/api/tests/routes`

- [ ] **Step 2: Create rules route tests**

Create `packages/api/tests/routes/rules.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  rule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { rulesRouter } from '../../src/routes/rules.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/rules', rulesRouter);
  return app;
}

describe('Rules route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /rules', () => {
    it('rejects missing name', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ type: 'COST_CAP_SESSION', scope: {}, condition: {}, action: 'ALERT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('rejects invalid type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ name: 'Test', type: 'INVALID', scope: {}, condition: {}, action: 'ALERT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('rejects invalid action', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ name: 'Test', type: 'COST_CAP_SESSION', scope: {}, condition: {}, action: 'DESTROY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action');
    });

    it('accepts valid input and strips protected fields', async () => {
      const app = createApp();
      mockPrisma.rule.create.mockResolvedValue({ id: 'r1', name: 'Test' });

      const res = await request(app)
        .post('/rules')
        .send({
          name: 'Test', type: 'COST_CAP_SESSION', scope: { global: true },
          condition: { maxCost: 50 }, action: 'ALERT',
          triggerCount: 999, enabled: false, // should be stripped
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.rule.create).toHaveBeenCalledWith({
        data: { name: 'Test', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'ALERT' },
      });
    });
  });
});
```

- [ ] **Step 3: Create alerts route tests**

Create `packages/api/tests/routes/alerts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockAlertManager = vi.hoisted(() => ({
  batchMarkRead: vi.fn(),
  batchDismiss: vi.fn(),
  getAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getById: vi.fn(),
  markRead: vi.fn(),
  dismiss: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('../../src/services/intelligence/alert-manager.js', () => ({
  alertManager: mockAlertManager,
}));

import { alertsRouter } from '../../src/routes/alerts.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/alerts', alertsRouter);
  return app;
}

describe('Alerts route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('PUT /alerts/batch/read', () => {
    it('rejects missing ids', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/read').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ids');
    });

    it('rejects empty ids array', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/read').send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it('accepts valid ids array', async () => {
      const app = createApp();
      mockAlertManager.batchMarkRead.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/read').send({ ids: ['a1', 'a2'] });
      expect(res.status).toBe(200);
      expect(mockAlertManager.batchMarkRead).toHaveBeenCalledWith(['a1', 'a2']);
    });
  });

  describe('PUT /alerts/batch/dismiss', () => {
    it('rejects non-array ids', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/dismiss').send({ ids: 'not-array' });
      expect(res.status).toBe(400);
    });

    it('accepts valid ids array', async () => {
      const app = createApp();
      mockAlertManager.batchDismiss.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/dismiss').send({ ids: ['a1'] });
      expect(res.status).toBe(200);
    });
  });
});
```

- [ ] **Step 4: Create webhooks route tests**

Create `packages/api/tests/routes/webhooks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  webhook: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/intelligence/webhook-service.js', () => ({
  webhookService: { test: vi.fn() },
}));

import { webhooksRouter } from '../../src/routes/webhooks.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('Webhooks route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /webhooks', () => {
    it('rejects invalid URL', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'not-a-url', events: ['ANOMALY'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('rejects empty events array', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('events');
    });

    it('rejects invalid event types', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['INVALID'] });
      expect(res.status).toBe(400);
    });

    it('accepts valid webhook creation', async () => {
      const app = createApp();
      mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-1', name: 'Test', secret: null });

      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['ANOMALY', 'RULE_BREACH'] });
      expect(res.status).toBe(201);
    });
  });
});
```

- [ ] **Step 5: Install supertest dev dependency**

Run: `cd packages/api && pnpm add -D supertest @types/supertest`

- [ ] **Step 6: Full build and test**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test`
Expected: All packages build, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/tests/routes/ packages/api/package.json pnpm-lock.yaml
git commit -m "test(api): add route validation tests for rules, alerts, webhooks"
```
