# Pulse Intelligence Engine — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Sub-project:** 2 of 3

## Overview

The Intelligence Engine adds AI-powered optimization suggestions, anomaly detection, governance rules with soft enforcement, and a webhook-based alert system to Pulse. It transforms Pulse from a passive monitor into an active cost optimization and governance platform.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enforcement model | Advisory + soft enforcement | Pause/flag sessions on rule breach; user can override from GUI. Balances safety with control — won't kill sessions mid-work. |
| Notification channels | Dashboard + external (webhooks) | Webhooks integrate with Slack/Discord/email/any HTTP endpoint. More useful than browser push notifications. |
| Insight scope | All categories | Cost optimization, usage patterns, anomaly detection, governance, proactive recommendations. |
| Computation model | Hybrid | Real-time for urgent (burn rate spikes, cost cap breaches). Batch every 5 min for trends and recommendations. |
| Code location | All in `@pulse/api` | No new package. Services fit naturally alongside `session-service.ts`. Extract to shared later only if needed. |
| Architecture pattern | Service Ensemble | Independent services (RuleEngine, AnomalyDetector, InsightGenerator, AlertManager, WebhookService, Scheduler). Each single-responsibility, independently testable. |

## Architecture

### New Services

All in `packages/api/src/services/intelligence/`:

```
intelligence/
  rule-engine.ts        — Evaluates rules against live events
  anomaly-detector.ts   — Detects burn rate spikes, unusual patterns
  insight-generator.ts  — Periodic trend analysis & recommendations
  alert-manager.ts      — Central funnel: creates alerts, dispatches notifications
  webhook-service.ts    — Delivers payloads to external endpoints
  scheduler.ts          — Cron-like batch job runner (5-min insight cycle)
```

### Data Flow

```
Token Event (WebSocket)
  │
  ├─► RuleEngine.evaluate()     ─► violations ─► AlertManager.create()
  │                                                   │
  ├─► AnomalyDetector.check()   ─► anomalies ─► AlertManager.create()
  │                                                   │
  │                                                   ├─► Persist to DB
  │                                                   ├─► Redis pub/sub → Dashboard WebSocket
  │                                                   ├─► WebhookService.dispatch()
  │                                                   └─► session_pause (if PAUSE action)
  │
  └─► (existing) Persist TokenEvent + Update Session

Scheduler (every 5 min)
  │
  └─► InsightGenerator.analyze() ─► insights ─► Persist to DB
                                                └─► AlertManager.create() (for notable ones)
```

## Data Model

> **Note:** All new models use `@default(uuid())` to match the existing Session/TokenEvent models, and include `@@map` annotations for snake_case PostgreSQL table naming consistency.

### Rule

User-defined governance rules.

```prisma
model Rule {
  id              String     @id @default(uuid())
  name            String                          // "Project Alpha daily cap"
  type            RuleType                        // COST_CAP | MODEL_RESTRICTION | etc.
  scope           Json                            // { projectName?, sessionType?, global? }
  condition       Json                            // { maxCost: 50, period: "daily" }
  action          RuleAction                      // ALERT | PAUSE | BLOCK
  enabled         Boolean    @default(true)
  lastTriggeredAt DateTime?  @map("last_triggered_at")
  triggerCount    Int        @default(0) @map("trigger_count")
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")
  alerts          Alert[]

  @@map("rules")
}

enum RuleType {
  COST_CAP_SESSION          // per-session cost limit
  COST_CAP_DAILY            // daily total spend ceiling
  COST_CAP_PROJECT          // per-project daily/weekly/monthly
  MODEL_RESTRICTION         // allowed models per project
  BURN_RATE_LIMIT           // max tokens/min before flagging
  SESSION_DURATION          // max session length
}

enum RuleAction {
  ALERT                     // notify only (advisory)
  PAUSE                     // pause session + notify (soft enforcement)
  BLOCK                     // flag + alert (retroactive — see note below)
}
```

> **BLOCK clarification:** Pulse cannot intercept Claude Code sessions in real-time before a model is used — the token event arrives *after* the model call. BLOCK is therefore **retroactive**: it creates a CRITICAL alert, fires webhooks, and flags the session. It does NOT terminate or pause the session automatically. For proactive model governance, pair MODEL_RESTRICTION rules with a PAUSE action to pause the session after the first violating event.

**Condition schemas by rule type:**

| Rule Type | Condition Fields | Example |
|-----------|-----------------|---------|
| `COST_CAP_SESSION` | `{ maxCost: number }` | `{ maxCost: 50 }` |
| `COST_CAP_DAILY` | `{ maxCost: number }` | `{ maxCost: 200 }` |
| `COST_CAP_PROJECT` | `{ maxCost: number, period: "daily" \| "weekly" \| "monthly" }` | `{ maxCost: 500, period: "weekly" }` |
| `MODEL_RESTRICTION` | `{ allowedModels: string[] }` | `{ allowedModels: ["sonnet", "haiku"] }` |
| `BURN_RATE_LIMIT` | `{ maxRate: number }` (tokens/min) | `{ maxRate: 50000 }` |
| `SESSION_DURATION` | `{ maxMinutes: number }` | `{ maxMinutes: 120 }` |

### Alert

Generated notifications from rules, anomalies, and insights.

```prisma
model Alert {
  id          String      @id @default(uuid())
  type        AlertType
  severity    Severity
  title       String
  message     String
  metadata    Json                            // { sessionId, ruleId, currentValue, threshold }
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

  @@map("alerts")
}

enum AlertType {
  RULE_BREACH               // governance rule triggered
  ANOMALY                   // anomaly detector flagged
  INSIGHT                   // proactive recommendation
  SYSTEM                    // system-level (agent disconnected, etc.)
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
```

### Insight

Generated recommendations and trend analysis.

```prisma
model Insight {
  id            String        @id @default(uuid())
  category      InsightCategory
  title         String                        // "Switch to Sonnet for Project Alpha"
  description   String                        // Detailed explanation
  impact        Json                          // { estimatedSavings: 45.00, confidence: 0.85 }
  metadata      Json                          // Supporting data points
  dedupKey      String        @unique @map("dedup_key") // category + metadata hash for deduplication
  status        InsightStatus @default(ACTIVE)
  alerts        Alert[]
  createdAt     DateTime      @default(now()) @map("created_at")
  dismissedAt   DateTime?     @map("dismissed_at")
  appliedAt     DateTime?     @map("applied_at")

  @@map("insights")
}

enum InsightCategory {
  COST_OPTIMIZATION         // model downgrades, caching suggestions
  USAGE_PATTERN             // peak hours, project spend distribution
  ANOMALY_TREND             // recurring anomalies, degradation
  PLAN_RECOMMENDATION       // upgrade/downgrade suggestion
}

enum InsightStatus {
  ACTIVE
  DISMISSED
  APPLIED
}
```

### Webhook

External notification endpoints.

```prisma
model Webhook {
  id          String   @id @default(uuid())
  name        String                          // "Slack #pulse-alerts"
  url         String                          // https://hooks.slack.com/...
  secret      String?                         // HMAC signing secret
  events      String[]                        // ["RULE_BREACH", "ANOMALY", "INSIGHT", "SYSTEM"]
  enabled     Boolean  @default(true)
  failCount   Int      @default(0) @map("fail_count") // consecutive failures
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  lastError   String?  @map("last_error")
  lastSentAt  DateTime? @map("last_sent_at")

  @@map("webhooks")
}
```

> **Webhook events** use the `AlertType` enum values exactly: `"RULE_BREACH"`, `"ANOMALY"`, `"INSIGHT"`, `"SYSTEM"`. This ensures consistent matching between alert creation and webhook dispatch.

> **Circuit breaker:** After 5 consecutive delivery failures (`failCount >= 5`), the webhook is auto-disabled (`enabled = false`). The dashboard shows "Auto-disabled: 5 consecutive failures" with a "Re-enable" button. `failCount` resets to 0 on any successful delivery.

### Session Model Update

```prisma
model Session {
  // ... existing fields ...
  status    SessionStatus @default(ACTIVE) @map("status")
  alerts    Alert[]       // reverse relation for Alert.sessionId
}

enum SessionStatus {
  ACTIVE
  PAUSED
  ENDED
}
```

## Service Specifications

### 1. RuleEngine

**Execution:** Real-time — called on every `token_event` in the WebSocket handler.

```typescript
class RuleEngine {
  private ruleCache: Rule[] = []
  private lastRefresh: number = 0
  private violationTimers: Map<string, number> = new Map()  // ruleId:sessionId → first violation timestamp

  async evaluate(event: TokenEvent, session: Session): Promise<RuleViolation[]>
  async refreshCache(): Promise<void>  // called every 60s by scheduler
  private checkSustained(ruleId: string, sessionId: string, durationMs: number): boolean
}
```

**Stateful evaluation:** For `BURN_RATE_LIMIT` rules, the RuleEngine tracks when a violation first started per rule+session. On each event, if the burn rate still exceeds the threshold and the violation has been sustained for 2+ minutes, the action escalates from ALERT to PAUSE. When the rate drops below the threshold, the timer is cleared.

**Rule evaluation logic:**

| Rule Type | Condition Check | Default Action |
|-----------|----------------|----------------|
| `COST_CAP_SESSION` | `session.totalCost >= condition.maxCost` | PAUSE |
| `COST_CAP_DAILY` | `SUM(today's sessions cost) >= condition.maxCost` | ALERT |
| `COST_CAP_PROJECT` | `SUM(project spend for period) >= condition.maxCost` | PAUSE |
| `MODEL_RESTRICTION` | `event.model NOT IN condition.allowedModels` | BLOCK |
| `BURN_RATE_LIMIT` | `event.burnRatePerMin >= condition.maxRate` | ALERT (first), PAUSE (sustained 2+ min) |
| `SESSION_DURATION` | `now - session.startedAt >= condition.maxMinutes` | PAUSE |

**Performance:** Rules cached in memory. Cache refreshed every 60 seconds. Evaluation is synchronous map/filter — no DB queries in the hot path except for aggregate rules (COST_CAP_DAILY, COST_CAP_PROJECT) which use Redis-cached counters updated on each event.

**Daily cap boundary:** "Today" is defined as midnight-to-midnight UTC. Sessions that started yesterday but are still active count their **today-portion** of cost toward today's cap (using TokenEvents with `timestamp >= midnight UTC`). Redis counters are reset at midnight UTC via the Scheduler.

### 2. AnomalyDetector

**Execution:** Real-time — called on every `token_event`.

```typescript
class AnomalyDetector {
  private baselineStats: Map<string, RunningStats> = new Map()

  async check(event: TokenEvent, session: Session): Promise<Anomaly[]>
  async persistBaselines(): Promise<void>  // periodic save to Redis
  async loadBaselines(): Promise<void>     // on startup
}
```

**Detection rules:**

| Anomaly | Detection Logic | Severity |
|---------|----------------|----------|
| Burn rate spike | `burnRatePerMin > 3x` rolling average for session type | WARNING (3x), CRITICAL (5x) |
| Generation loop | `output / (input + output) > 0.95` for 3+ consecutive events | WARNING |
| Cost velocity | Extrapolated session cost (last 5 events) > $100 | WARNING |
| Abnormal termination cluster | 3+ sessions ended abnormally in 1 hour | CRITICAL (batch-assisted) |
| Cache efficiency drop | Session `cacheRead / (cacheRead + input) < 50%` of user baseline | INFO |

**RunningStats:** Maintains per-session-type exponentially weighted moving averages for burn rate, cost per event, token ratios. Persisted to Redis every 60 seconds for restart recovery.

### 3. InsightGenerator

**Execution:** Batch — runs every 5 minutes via Scheduler. Weekly digest on Sundays.

```typescript
class InsightGenerator {
  async analyze(): Promise<Insight[]>
  async weeklyDigest(): Promise<Insight>
}
```

**Insight types:**

| Category | Logic | Example Output |
|----------|-------|----------------|
| Model optimization | Sessions using Opus with <500 avg output tokens → suggest Sonnet | "Switch Project Alpha to Sonnet — save ~$45/week" |
| Cache efficiency trend | Compare this week's cache hit rate to last week | "Cache hit rate dropped 15% — check prompt structure" |
| Spend distribution | Group costs by project, flag >50% concentration | "Project Alpha accounts for 68% of total spend" |
| Session cost trend | Compare avg session cost week-over-week | "Avg session cost up 25% this week ($12.40 → $15.50)" |
| Plan recommendation | 30-day rolling spend vs plan tiers | "Based on usage, Pro plan would save $X/mo" |
| Peak usage | Hourly distribution analysis | "Peak usage 2-4pm — schedule agent work off-peak" |
| Weekly digest | Aggregate all metrics into summary | "This week: 47 sessions, $312 spent (↑12%), 3 anomalies" |

**Deduplication:** Each insight gets a `dedupKey` = `${category}:${stableHash}` where `stableHash` is a SHA-256 of the sorted, deterministic subset of metadata that defines the insight's identity (e.g., for model optimization: `projectName + suggestedModel`; for spend distribution: `topProject`). Won't create an insight if one with the same `dedupKey` exists and is ACTIVE or was created in the last 24 hours.

**Apply logic:** When `PUT /api/insights/:id/apply` is called on a `COST_OPTIMIZATION` insight whose metadata contains a `suggestedRule` object, the server creates the suggested Rule automatically (via `RuleEngine`) and marks the insight as APPLIED. The response includes the created rule ID.

### 4. AlertManager

**Execution:** Called by RuleEngine, AnomalyDetector, and InsightGenerator.

```typescript
class AlertManager {
  async create(input: CreateAlertInput): Promise<Alert>
  async markRead(id: string): Promise<void>
  async dismiss(id: string): Promise<void>
  async resolve(id: string): Promise<void>
  async getAlerts(filters: AlertFilters): Promise<Alert[]>
  async getUnreadCount(): Promise<number>
}
```

**On create:**
1. Persist alert to database
2. Publish to Redis channel `pulse:alerts` → WebSocket broadcasts to dashboard clients (real-time badge update + toast notification)
3. Call `WebhookService.dispatch(alert)` for matching webhook subscriptions
4. If alert triggers a PAUSE action: send `session_pause` message via WebSocket to the agent

### 5. WebhookService

**Execution:** Called by AlertManager on each alert creation.

```typescript
class WebhookService {
  async dispatch(alert: Alert): Promise<void>
  async test(webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }>
}
```

**Delivery:**
- Finds webhooks where `events[]` includes the alert type
- POST JSON payload with optional HMAC-SHA256 signature (`X-Pulse-Signature` header)
- Retry: 3 attempts with exponential backoff (1s, 5s, 30s)
- Updates `lastSentAt` / `lastError` on webhook record

**Payload format:**
```json
{
  "event": "rule_breach",
  "alert": {
    "id": "clx...",
    "type": "RULE_BREACH",
    "severity": "CRITICAL",
    "title": "Session cost cap exceeded",
    "message": "Session abc reached $52.30, exceeding $50 limit",
    "metadata": { "sessionId": "abc", "ruleId": "def", "currentCost": 52.30, "threshold": 50 }
  },
  "timestamp": "2026-04-07T14:30:00Z"
}
```

### 6. Scheduler

**Execution:** Starts with Express server, manages periodic jobs.

```typescript
class Scheduler {
  start(): void
  stop(): void
}
```

**Jobs:**

| Interval | Job | Service |
|----------|-----|---------|
| 60 seconds | Refresh rule cache | RuleEngine |
| 60 seconds | Persist anomaly baselines | AnomalyDetector |
| 5 minutes | Run insight analysis | InsightGenerator |
| Sunday 9:00 AM | Weekly digest | InsightGenerator |

Uses `node-cron` for the weekly job, `setInterval` for the frequent jobs. Graceful shutdown clears all intervals.

## API Routes

### Rules CRUD

```
GET    /api/rules                    → list all rules
GET    /api/rules/:id                → get single rule (with trigger stats)
POST   /api/rules                    → create rule
PUT    /api/rules/:id                → update rule
DELETE /api/rules/:id                → delete rule
POST   /api/rules/:id/toggle         → enable/disable
```

### Alerts

All list endpoints support pagination: `?page=1&limit=20` (defaults: page=1, limit=20).

```
GET    /api/alerts                    → list alerts (?status, ?severity, ?type, ?since, ?page, ?limit)
GET    /api/alerts/:id                → get single alert
GET    /api/alerts/unread-count       → unread count for badge
PUT    /api/alerts/:id/read           → mark as read
PUT    /api/alerts/:id/dismiss        → dismiss
PUT    /api/alerts/:id/resolve        → resolve
PUT    /api/alerts/batch/read         → mark multiple as read (body: { ids: string[] })
PUT    /api/alerts/batch/dismiss      → dismiss multiple (body: { ids: string[] })
```

### Insights

```
GET    /api/insights                  → list insights (?category, ?status, ?page, ?limit)
GET    /api/insights/:id              → get single insight
PUT    /api/insights/:id/dismiss      → dismiss insight
PUT    /api/insights/:id/apply        → mark as applied (server-side: auto-creates rule if applicable)
```

> **Insight apply logic:** When an insight with category `COST_OPTIMIZATION` and metadata containing `suggestedRule` is applied, the server automatically creates the suggested Rule and links it. The response includes the created rule ID. This powers Scenario 4 (Cost Optimization Loop).

### Webhooks CRUD

```
GET    /api/webhooks                  → list webhooks
GET    /api/webhooks/:id              → get single webhook
POST   /api/webhooks                  → create webhook
PUT    /api/webhooks/:id              → update webhook
DELETE /api/webhooks/:id              → delete webhook
POST   /api/webhooks/:id/test         → send test payload
POST   /api/webhooks/:id/enable       → re-enable after auto-disable
```

### Session Enforcement

```
POST   /api/sessions/:id/pause        → manually pause session from dashboard
POST   /api/sessions/:id/resume       → resume paused session
```

## Agent Changes

### WebSocket Session-to-Agent Mapping

The existing `ws-server.ts` broadcasts to all clients of a role but has no concept of which agent connection owns which sessions. To support targeted pause/resume:

1. **Session registry:** `ws-server.ts` maintains a `Map<sessionId, WebSocket>` updated on `session_start` (register) and `session_end` / disconnect (deregister).
2. **Targeted send:** `sendToAgent(sessionId, message)` looks up the specific WebSocket connection for that session. Falls back to broadcast if mapping is stale.

### New WebSocket Message Types

**API → Agent:**
```typescript
{ type: 'session_pause', sessionId: string, reason: string, ruleId?: string }
{ type: 'session_resume', sessionId: string }
```

### Agent-Side Implementation Changes

**TelemetryStreamer** — currently only sends messages; needs a `ws.on('message', ...)` handler added:
- Listens for `session_pause` and `session_resume` messages
- On `session_pause`: sets `paused = true`, buffers subsequent events in memory (does not discard)
- On `session_resume`: sets `paused = false`, flushes buffered events, resumes normal streaming
- Agent continues to watch files regardless of pause state

**SessionTracker** — needs `pause(sessionId)` and `resume(sessionId)` methods:
- Adds `status: 'active' | 'paused'` property to tracked sessions
- Existing `markEnded` deletes the session; `pause` keeps it alive but flagged

## Dashboard UI Changes

### Insights Page (`/insights`)

Replace ComingSoon placeholder with:
- Insight cards grouped by category (Cost Optimization, Usage Patterns, Anomaly Trends, Plan)
- Each card: category icon, title, description, impact badge (estimated savings), "Apply" + "Dismiss" buttons
- Filter bar: category dropdown, status toggle (active/dismissed/applied)
- Empty state: "No insights yet — Pulse is analyzing your usage patterns"

### Alerts Page (`/alerts`)

Replace ComingSoon placeholder with:
- Real-time alert feed, newest first
- Severity badges: INFO (blue), WARNING (amber), CRITICAL (red)
- Quick actions per alert: mark read, dismiss, "View Session" link
- Bulk actions: mark all read, dismiss all
- Unread count updates in real-time via WebSocket
- Filter bar: severity, type, status

### Rules Page (`/rules`)

Replace ComingSoon placeholder with:
- Rule cards with:
  - Toggle switch (enable/disable)
  - Rule name, type badge, scope description
  - Action badge (Alert/Pause/Block)
  - Last triggered timestamp, total trigger count
- "Create Rule" button → modal with:
  - Type selector (6 rule types)
  - Scope picker (global, per-project dropdown, per-session-type)
  - Condition fields (dynamic based on type)
  - Action selector (Alert/Pause/Block)
- Delete confirmation dialog

### Settings Page — Webhooks Section

New section added to settings:
- Webhook list: name, URL (truncated), event subscriptions as badges, status indicator
- "Add Webhook" button → modal: name, URL, secret (optional), event checkboxes
- Per-webhook: "Test" button (shows success/failure), "Edit", "Delete"
- Last sent timestamp, last error display

### Sidebar Updates

- Alerts nav item: red badge with unread count (hidden when 0)
- Uses SWR polling or WebSocket push for real-time badge updates

### Dashboard Updates

- Replace static mock InsightCard with latest real insight from `/api/insights?status=active&limit=1`
- Show alert count in page header if unread > 0

## Scenarios

### 1. Runaway Agent Detection
Agent session burn rate 5x baseline for 2+ minutes → AnomalyDetector fires CRITICAL anomaly → AlertManager creates alert + dispatches webhook → Slack notification arrives → User opens Pulse, sees session card with red ring + "Anomaly: burn rate spike" → Session auto-paused → User clicks "Resume" or "Terminate"

### 2. Budget Guard
User creates two COST_CAP_DAILY rules: (1) "Daily warning" at $180 with ALERT action, (2) "Daily hard cap" at $200 with PAUSE action → At $180: WARNING alert + webhook → At $200: all active sessions receive PAUSE with "Daily budget exhausted" → Resets at midnight UTC → Next day sessions flow normally

> **Implementation note:** Graduated thresholds require multiple rules. The "Create Rule" UI can offer a "Add warning threshold" convenience option that creates both rules in one flow.

### 3. Model Governance
Rule: "project-beta: sonnet only" (MODEL_RESTRICTION) → Agent starts Opus session for project-beta → RuleEngine detects violation → BLOCK alert → Webhook fires → Dashboard shows "Blocked: model not allowed for this project"

### 4. Cost Optimization Loop
InsightGenerator detects 80% of Project Alpha sessions use Opus for <500 avg output tokens → Creates insight: "Switch Project Alpha to Sonnet — estimated $45/week savings" → User clicks "Apply" on insight card → System creates a MODEL_RESTRICTION rule automatically (allowedModels: ["sonnet"]) → Insight marked as APPLIED

### 5. Cache Regression Alert
Cache hit rate drops from 65% to 30% over 3 days → InsightGenerator creates ANOMALY_TREND insight: "Cache efficiency degraded — check for prompt structure changes" → Links to affected sessions in metadata → User investigates

### 6. Weekly Health Digest
Sunday 9am: InsightGenerator.weeklyDigest() runs → "This week: 47 sessions, $312 spent (↑12% vs last week), 3 anomalies detected, 2 rules triggered. Top recommendation: enable caching for Project Gamma." → Delivered as INSIGHT alert → Webhook sends to Slack

## Shared Types (`@pulse/shared`)

The following types must be added to `packages/shared/src/types.ts` for the web frontend to consume API responses:

```typescript
// Enums (mirror Prisma enums)
export type RuleType = 'COST_CAP_SESSION' | 'COST_CAP_DAILY' | 'COST_CAP_PROJECT' | 'MODEL_RESTRICTION' | 'BURN_RATE_LIMIT' | 'SESSION_DURATION'
export type RuleAction = 'ALERT' | 'PAUSE' | 'BLOCK'
export type AlertType = 'RULE_BREACH' | 'ANOMALY' | 'INSIGHT' | 'SYSTEM'
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL'
export type AlertStatus = 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED'
export type InsightCategory = 'COST_OPTIMIZATION' | 'USAGE_PATTERN' | 'ANOMALY_TREND' | 'PLAN_RECOMMENDATION'
export type InsightStatus = 'ACTIVE' | 'DISMISSED' | 'APPLIED'
export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'ENDED'

// Interfaces
export interface Rule { id: string; name: string; type: RuleType; scope: RuleScope; condition: RuleCondition; action: RuleAction; enabled: boolean; lastTriggeredAt: string | null; triggerCount: number; createdAt: string; updatedAt: string }
export interface Alert { id: string; type: AlertType; severity: Severity; title: string; message: string; metadata: Record<string, unknown>; status: AlertStatus; sessionId: string | null; ruleId: string | null; insightId: string | null; createdAt: string; readAt: string | null; dismissedAt: string | null }
export interface Insight { id: string; category: InsightCategory; title: string; description: string; impact: InsightImpact; metadata: Record<string, unknown>; status: InsightStatus; createdAt: string; dismissedAt: string | null; appliedAt: string | null }
export interface Webhook { id: string; name: string; url: string; events: AlertType[]; enabled: boolean; failCount: number; createdAt: string; updatedAt: string; lastError: string | null; lastSentAt: string | null }

// Supporting types
export interface RuleScope { projectName?: string; sessionType?: string; global?: boolean }
export interface RuleCondition { maxCost?: number; period?: 'daily' | 'weekly' | 'monthly'; allowedModels?: string[]; maxRate?: number; maxMinutes?: number }
export interface InsightImpact { estimatedSavings?: number; confidence?: number; percentChange?: number }

// WebSocket message types (API → Agent)
export interface SessionPauseMessage { type: 'session_pause'; sessionId: string; reason: string; ruleId?: string }
export interface SessionResumeMessage { type: 'session_resume'; sessionId: string }

// WebSocket message types (API → Dashboard)
export interface AlertNotification { type: 'alert'; alert: Alert }
```

## Redis Channels

Existing:
- `pulse:token_events` — Real-time token event streaming
- `pulse:session_updates` — Session start/end notifications

New:
- `pulse:alerts` — Alert notifications broadcast to dashboard WebSocket clients

## Performance Considerations

- **Rule evaluation hot path:** Rules cached in memory (no DB query per event). Aggregate rules (daily/project caps) use Redis-cached running totals.
- **Anomaly detection:** In-memory running stats with EWMA. O(1) per check.
- **Insight generation:** Batch queries run every 5 min. Use Prisma aggregations to minimize data transfer.
- **WebSocket overhead:** Alert broadcasts add one Redis publish per alert. Negligible compared to existing token event volume.
- **Webhook delivery:** Async with retries. Failures don't block the event pipeline.

## Dependencies

- `node-cron` — Weekly digest scheduling
- No other new dependencies. Uses existing Prisma, Redis (ioredis), Express, ws stack.

## Out of Scope (Sub-project 3)

- Multi-user/team rules and permissions
- Per-user alert preferences
- Authentication and authorization
- Production deployment
- Agent npm package publishing
