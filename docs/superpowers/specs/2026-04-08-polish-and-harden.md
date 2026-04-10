# Sub-project 3: Polish & Harden — Design Spec

Fixes all issues found in the Intelligence Engine code review and fills remaining spec gaps. No new features — only hardening, validation, caching, and test coverage.

## 1. Shared PrismaClient Singleton

Create `packages/api/src/services/prisma.ts` exporting a single `PrismaClient` instance. Update every file that currently instantiates its own client:

**Intelligence services:** `alert-manager.ts`, `rule-engine.ts`, `insight-generator.ts`, `webhook-service.ts`

**Original services:** `session-service.ts`

**Routes:** `dashboard.ts`, `sessions.ts`, `health.ts`, `rules.ts`, `alerts.ts`, `insights.ts`, `webhooks.ts`

Each file replaces `const prisma = new PrismaClient()` with `import { prisma } from '../services/prisma.js'` (path adjusted per depth).

## 2. Webhook Retry Logic

Update `WebhookService.deliver()` to retry failed deliveries asynchronously.

- `dispatch()` fires delivery without awaiting — returns immediately
- 3 attempts with exponential backoff: 1s, 5s, 30s delays via `setTimeout`
- Only retry on transient failures (network errors, 5xx responses). 4xx stops immediately
- `failCount` increments only after all 3 attempts exhausted (not per individual attempt)
- Circuit breaker threshold unchanged: auto-disable after 5 final failures

Flow:
```
alert created
  -> dispatch() fires deliver() (no await)
    -> attempt 1 -> success? done
    -> attempt 1 fails (5xx/network) -> setTimeout 1s -> attempt 2
    -> attempt 2 fails -> setTimeout 5s -> attempt 3
    -> attempt 3 fails -> increment failCount, check circuit breaker
    -> 4xx at any point -> stop retrying, increment failCount immediately
```

## 3. Route Input Validation

Manual guard clauses at the top of each body-accepting route handler. No validation library.

### Rules routes (`rules.ts`)
- **POST /**: Require `name` (string), `type` (valid RuleType), `scope` (object), `condition` (object), `action` (valid RuleAction). Strip `triggerCount`, `lastTriggeredAt`, `enabled`.
- **PUT /:id**: Same fields optional. Strip protected fields.

### Webhooks routes (`webhooks.ts`)
- **POST /**: Require `name` (string), `url` (valid URL), `events` (non-empty array of valid event types). Optional `secret` (string). Strip `failCount`, `lastFailure`, `enabled`.
- **PUT /:id**: Same fields optional. Strip protected fields.

### Alerts routes (`alerts.ts`)
- **PUT /batch/read** and **PUT /batch/dismiss**: Require `ids` is a non-empty array of strings.

### Insights routes
No changes needed — apply/dismiss use URL params only.

Validation pattern:
```typescript
const { name, type, scope, condition, action } = req.body;
if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
if (!VALID_RULE_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
// create with only validated fields
prisma.rule.create({ data: { name, type, scope, condition, action } });
```

## 4. Redis Cache for COST_CAP_PROJECT

Add Redis-cached running totals for project cost aggregation, matching the `COST_CAP_DAILY` pattern.

- **Cache key**: `pulse:project_cost:{projectSlug}:{period}` (e.g., `monthly`, `weekly`)
- **On token event**: `ws-server.ts` increments the project cost key alongside the existing daily cost key (when the session has a project slug)
- **In `checkCostCapProject`**: Try Redis first, fall back to DB aggregation, write result back to Redis on cache miss
- **Expiry**: 31 days for monthly, 7 days for weekly
- **Reset**: Scheduler handles period boundary resets

## 5. Remaining Important Fixes

### I2 — Midnight cost reset
Replace the fragile `setInterval` + `getUTCHours() === 0 && getUTCMinutes() === 0` check in `scheduler.ts` with a `node-cron` schedule `'0 0 * * *'` (midnight UTC).

### I4 — Redis write-back on cache miss
In `checkCostCapDaily`, after the DB fallback query, write the result back to Redis: `SET pulse:daily_cost {value} EX 86400`.

### I5 — applyInsight type safety
Replace the `as any` cast in `insight-generator.ts` with explicit field extraction and validation from `metadata.suggestedRule` before passing to `prisma.rule.create()`.

### I6 — Session history cleanup on disconnect
In `ws-server.ts`, when a WebSocket disconnects and the session is removed from `sessionRegistry`, call `anomalyDetector.clearSession(sessionId)` to prevent unbounded map growth.

### I7 — Route ordering comment
Add a comment above `GET /unread-count` in `alerts.ts` explaining it must stay above `GET /:id` to avoid Express route parameter capture.

## 6. Missing Spec Features

### S2 — Abnormal termination cluster detection
Add `checkAbnormalTerminations()` to `AnomalyDetector`. Track session end reasons in an in-memory sliding window (array of `{ timestamp, sessionId }`). If 3+ sessions end with a non-normal reason (i.e., `endReason` is not `'completed'` or `'user_stopped'` — covers crashes, errors, timeouts, and unexpected disconnects) within a 1-hour window, fire a CRITICAL anomaly. Checked on each `session_end` event. Window entries older than 1 hour are pruned on each check.

### S3 — Peak usage and plan recommendation insights
Add two methods to `InsightGenerator`:

- `analyzePeakUsage()` — Query sessions by hour-of-day over the past 7 days. If >60% of cost concentrates in a 4-hour window, generate a USAGE_PATTERN insight suggesting off-peak scheduling.
- `analyzePlanRecommendation()` — Compare actual monthly spend against plan tiers. If usage consistently exceeds or underutilizes the plan, suggest upgrade/downgrade. Category: COST_OPTIMIZATION.

Both run in the existing 5-minute batch cycle via `insightGenerator.analyze()`.

## 7. Test Coverage

### rule-engine.test.ts (add cases)
- `COST_CAP_DAILY`: Redis hit path, Redis miss + DB fallback, Redis write-back after miss
- `COST_CAP_PROJECT`: Redis hit, Redis miss + DB fallback, period-based aggregation

### insight-generator.test.ts (add cases)
- `weeklyDigest()`: generates summary insight with correct stats
- `applyInsight()`: creates rule from metadata, marks insight applied, rejects invalid metadata
- `analyzePeakUsage()`: detects hour concentration, no false positive when spread evenly
- `analyzePlanRecommendation()`: suggests upgrade when over, downgrade when under

### anomaly-detector.test.ts (add cases)
- `checkAbnormalTerminations()`: fires at 3+ in 1 hour, does not fire at 2, sliding window expiry

### webhook-service.test.ts (add cases)
- Retry on 5xx: verifies 3 attempts with delays
- No retry on 4xx: stops immediately
- Circuit breaker increments only after all retries exhausted

### routes/ (new test directory)
- `rules.test.ts`: validation rejects missing fields, strips protected fields, accepts valid input
- `alerts.test.ts`: batch endpoints reject non-array ids, reject empty arrays
- `webhooks.test.ts`: validation rejects invalid URL, requires events array
