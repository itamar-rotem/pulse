# Multi-Project Design Spec

> **Sub-project 5** of the Pulse AI Dev Health Monitor roadmap.

## Overview

Promote "project" from a free-text `projectSlug` string on Session/TokenEvent to a first-class `Project` entity scoped to an Organization. Users get a dedicated projects UI, per-project settings (name, budget, status), per-project rules with a foreign-key scope (no more string matching), dashboard filters by project, and automatic project auto-creation on first use so the zero-config agent flow keeps working.

Built on top of the Sub-project 4 multi-tenant foundation: every query on `Project` (and all FK-related tables) is filtered by `orgId` via the tenant Prisma extension. Project slugs are unique WITHIN an org, not globally.

---

## 1. Problem & Goals

### Problem

Today, "project" in Pulse is a `projectSlug` string column on `Session` and `TokenEvent`, determined by the agent from the current working directory basename. There is no `Project` model, no project settings, no project-level budgets, no UI for managing projects, and no explicit membership. Rules that target a project use `scope.projectName` with a loose free-text match against `session.projectSlug`. The dashboard groups by slug in-memory on the frontend.

This makes it impossible to:
- Configure per-project metadata (display name, description, color, budget)
- Attach per-project rules that survive slug renames
- Archive a project without deleting its historical data
- Offer a canonical "All projects" index view
- Auto-generate a budget rule tied to a single project (without string drift)

### Goals

1. Introduce a first-class `Project` model scoped to an Organization.
2. Surface all projects in a dedicated `/projects` list with detail and settings pages.
3. Support per-project configuration: display name, description, color, icon, monthly budget, ACTIVE/ARCHIVED status.
4. Rewire the `COST_CAP_PROJECT` rule type to use `scope.projectId` (FK) instead of free-text `scope.projectName`.
5. Add project filters to Live View, Sessions, Alerts, and Insights.
6. Preserve the zero-config UX: when an agent reports a brand-new `projectSlug`, the API upserts a `Project` row for the active org.
7. Preserve historical data: all existing `Session`/`TokenEvent` rows are backfilled with a `projectId` FK to auto-created `Project` rows.

---

## 2. Non-Goals

- Per-project RBAC. We keep org-level `OWNER/ADMIN/MEMBER`. Any org member sees any project in their org.
- Cross-org project visibility or cross-org moves.
- Project templates or cloning.
- Per-project webhooks. Org-level webhooks remain the only form (a project filter on webhook events is a follow-up).
- Per-project API keys. API keys remain org-scoped.
- Custom project fields beyond a `metadata` JSON escape hatch.
- Renaming the `projectSlug` wire format on the agent protocol (stays the same in v1).

---

## 3. Schema Changes

### 3.1 New `Project` model

```prisma
enum ProjectStatus {
  ACTIVE
  ARCHIVED
}

model Project {
  id               String        @id @default(cuid())
  orgId            String        @map("org_id")
  org              Organization  @relation(fields: [orgId], references: [id])
  slug             String
  name             String
  description      String?
  color            String?       // hex, e.g. "#FF6B35"
  icon             String?       // lucide-react icon name or emoji
  monthlyBudgetUsd Float?        @map("monthly_budget_usd")
  status           ProjectStatus @default(ACTIVE)
  metadata         Json          @default("{}")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")
  archivedAt       DateTime?     @map("archived_at")

  sessions    Session[]
  tokenEvents TokenEvent[]

  @@unique([orgId, slug], name: "orgId_slug")
  @@index([orgId])
  @@index([orgId, status])
  @@map("projects")
}
```

Key design decisions:

- **Primary key: `cuid`**. Matches `Organization`, `User`, `ApiKey`, `Rule`. Session and TokenEvent use `uuid` for historical reasons; `Project` is a mgmt entity so cuid is fine.
- **Slug is scoped per-org**: `@@unique([orgId, slug])`. Two different orgs can each have a project named `my-app`. No global uniqueness.
- **Slug is immutable after creation**. The API rejects PATCH on `slug` (enforced at the route layer). If a user wants to "rename" a project's slug, they must create a new project. This is the only way to keep the denormalized `Session.projectSlug` honest over time.
- **Display `name` is mutable** and defaults to the slug on auto-create.
- **`archivedAt` vs `status`**: we keep both. `status` is the canonical query predicate (`WHERE status = 'ACTIVE'`); `archivedAt` is a timestamp record. This matches the `ApiKey.revokedAt` / `Alert.dismissedAt` pattern in the existing schema.
- **`metadata` JSON escape hatch** for future fields without migration.

### 3.2 Modifications to `Session`

```prisma
model Session {
  // ... existing fields
  projectSlug         String        @map("project_slug")   // KEPT (denormalized)
  projectId           String        @map("project_id")
  project             Project       @relation(fields: [projectId], references: [id])
  // ...
  @@index([projectId])
  @@index([orgId, projectId, startedAt])  // supports dashboard filters
}
```

### 3.3 Modifications to `TokenEvent`

```prisma
model TokenEvent {
  // ... existing fields
  projectSlug            String        @map("project_slug")   // KEPT
  projectId              String        @map("project_id")
  project                Project       @relation(fields: [projectId], references: [id])
  // ...
  @@index([projectId])
  @@index([orgId, projectId, timestamp])
}
```

### 3.4 Modifications to `Organization`

```prisma
model Organization {
  // ... existing fields
  projects Project[]
}
```

### 3.5 Keep-or-drop `projectSlug` decision

**Decision: KEEP `projectSlug` as a denormalized column on `Session` and `TokenEvent`.**

Rationale:

1. **Hot-path performance.** `TokenEvent` is the highest-volume table in the system — every token message the agent sends produces one row. The WebSocket handler for `token_event` is latency-critical. A join from TokenEvent to Project on every dashboard query or real-time publish would add cost for a denormalized string that is ~20 bytes.
2. **Historical fidelity.** If a project is archived or recreated, the slug recorded at session time remains accurate in the historical record. Analytical queries like "what was this session called at the time?" still work.
3. **Low drift risk.** Slug is immutable on Project (we enforce this at the route layer). So the only way `Session.projectSlug` and `Project.slug` could diverge is if an admin manually rewrites the DB. That's an accepted operational risk.
4. **Simpler migration.** We can run the backfill incrementally without touching the data shape sessions read from.

Trade-off accepted: slight write amplification (two columns where one would do) and the need for the projectSlug column to stay in shared types for now. We revisit in v2 if storage cost becomes a problem (it won't for millions of events).

### 3.6 Tenant isolation

`Project` MUST be added to `TENANT_MODELS` in `packages/api/src/services/tenant-prisma.ts`:

```typescript
const TENANT_MODELS = new Set([
  'Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook', 'ApiKey', 'Project',
]);
```

This is load-bearing. Without it, a user in org A could read/write projects in org B via the tenant-scoped client.

---

## 4. API Surface

All endpoints require auth and are tenant-scoped via `req.prisma`. Reads are available to all roles; writes require `OWNER` or `ADMIN`.

### 4.1 REST endpoints

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| `GET` | `/api/projects` | any | List projects in the active org. Query: `status=active\|archived\|all` (default `active`), `q=<search>` (substring match on name/slug), `page`, `limit`. |
| `GET` | `/api/projects/:id` | any | Fetch one project (must belong to active org). Includes aggregates: total cost last 30d, session count, active session count. |
| `POST` | `/api/projects` | OWNER/ADMIN | Create project. Body: `{ slug, name?, description?, color?, icon?, monthlyBudgetUsd? }`. Slug is required and validated `^[a-z0-9][a-z0-9-_]{0,63}$`. Returns 409 on `(orgId, slug)` conflict. |
| `PATCH` | `/api/projects/:id` | OWNER/ADMIN | Update mutable fields: `name, description, color, icon, monthlyBudgetUsd, status, metadata`. Explicitly rejects `slug` in body with 400. |
| `DELETE` | `/api/projects/:id` | OWNER/ADMIN | Soft delete. Sets `status='ARCHIVED'` and `archivedAt=now()`. Does NOT cascade-delete sessions. |
| `POST` | `/api/projects/:id/restore` | OWNER/ADMIN | Unarchive. Sets `status='ACTIVE'`, clears `archivedAt`. |

### 4.2 Filter params on existing routes

The following routes gain an optional `projectId` filter query param:

- `GET /api/sessions/history?projectId=...`
- `GET /api/dashboard/live-summary?projectId=...`
- `GET /api/alerts?projectId=...` (joins through `alert.session.projectId` — if `sessionId` is null, the alert is excluded from a project filter)
- `GET /api/insights?projectId=...` (filters insights whose `metadata.projectId` matches)

The existing `projectSlug` filter on session history is preserved for backwards compat but marked deprecated in comments.

### 4.3 Auto-create on first use

In `startSession` (and defensively in `updateSession`), resolve a `Project` before writing the Session/TokenEvent:

```typescript
async function resolveProject(
  orgId: string,
  slug: string,
  db: PrismaClient,
): Promise<{ id: string; slug: string }> {
  // Tenant extension injects orgId into where on read AND into data on create.
  // We use unscoped global prisma here because upsert's where needs the full
  // compound unique key and the tenant extension only injects a top-level orgId
  // (not into compound unique lookups reliably).
  // We pass orgId explicitly to be safe.
  return globalPrisma.project.upsert({
    where: { orgId_slug: { orgId, slug } },
    update: {},
    create: { orgId, slug, name: slug, status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
}
```

Race safety: the `@@unique([orgId, slug])` constraint + Prisma `upsert` gives us Postgres `INSERT ... ON CONFLICT DO UPDATE` semantics. Concurrent agent connections reporting the same new slug cannot create duplicates.

Note: we call this with the global prisma (not the tenant-scoped client) because the tenant extension's `orgId` injection does not reliably cover the `orgId_slug` compound-unique `where` shape. We pass `orgId` explicitly. This is a narrow documented exception; all other reads remain tenant-scoped.

### 4.4 Budget enforcement: materialize or implicit?

**Decision: materialize a rule.** When a user sets `monthlyBudgetUsd` on a project via PATCH, the API upserts a corresponding `Rule` with:

```json
{
  "name": "Budget: <project name>",
  "type": "COST_CAP_PROJECT",
  "scope": { "projectId": "<project id>" },
  "condition": { "maxCost": <amount>, "period": "monthly" },
  "action": "ALERT",
  "enabled": true
}
```

Identified by a `metadata.source = "project_budget"` marker and `metadata.projectId = <id>`. On PATCH with a new value, the same rule is updated in-place. On PATCH to `null`, the rule is deleted. On project archive, the rule is disabled.

Rationale for materializing over implicit checking:

- **Single evaluation path.** The rule engine already handles `COST_CAP_PROJECT` evaluation, caching, Redis counters, alert creation, and webhook fan-out. Implicit budget checks would duplicate this plumbing.
- **Visibility.** Users see the budget rule in the Rules list alongside their hand-written rules. They can toggle, delete, or adjust it directly.
- **Composability.** Users can add a second rule with a lower `WARNING`-severity threshold (e.g., alert at 80% budget) without special-case code.

Trade-off: users who delete the auto-materialized rule "by hand" and then re-edit the project budget will have it recreated. We document this.

---

## 5. Frontend Surface

### 5.1 New pages

- `/projects` — list of projects in the active org.
  - Sidebar filter: `active | archived | all` (default `active`).
  - Search input (slug/name substring).
  - Each card shows: color swatch, name, slug, session count (30d), cost (30d), status pill, budget gauge (if budget set).
  - "New project" button (OWNER/ADMIN only) opens a modal with slug/name/description/color/budget.
- `/projects/[id]` — project detail.
  - Header with name, slug, edit/archive buttons, budget gauge.
  - Tabs or sections: "Sessions" (filtered session table), "Alerts" (project-scoped alerts), "Insights" (project-scoped insights), "Rules" (rules whose `scope.projectId === id`).
- `/projects/[id]/settings` — edit form (name, description, color, icon, monthly budget, archive toggle). OWNER/ADMIN only.

### 5.2 Sidebar nav

Add a "Projects" entry under the existing "Monitor" section in `packages/web/src/components/layout/sidebar.tsx`:

```tsx
<NavItem href="/projects" label="Projects" icon={FolderKanban} />
```

Placed between "Sessions" and the "Intelligence" group.

### 5.3 Filters on existing pages

- `/live` — add a "Project" dropdown in the filter bar. Values sourced from `GET /api/projects?status=active`. When set, filters active sessions and the token stream client-side (and passes `?projectId=` to `/api/dashboard/live-summary`).
- `/sessions` — the existing `project` filter (currently derived from distinct `projectSlug` values in the loaded page) switches to a server-side `?projectId=` filter populated from `GET /api/projects`.
- `/alerts` — add a project dropdown; passes `?projectId=` to the alerts route.
- `/insights` — same pattern.

### 5.4 Rule creation form

`packages/web/src/app/rules/page.tsx`: replace the free-text "Project name" input with a `<select>` populated from `GET /api/projects?status=active`. The form value becomes `scope: { projectId: "<selected id>" }` instead of `scope: { projectName: "<string>" }`.

Legacy rules with `scope.projectName` are handled by a display fallback: `scopeDescription()` resolves a projectName lookup or falls back to raw slug text, until the data migration (Section 6) rewrites them.

### 5.5 Session detail

`session-detail.tsx` shows the project name as a link to `/projects/[id]` when the session has a `projectId`.

---

## 6. Migration Strategy

Four-phase rollout, each its own task/commit.

### Phase 1: Add schema (nullable FK)

1. Add `Project` model, `ProjectStatus` enum, and `projects` back-ref on `Organization`.
2. Add nullable `projectId String?` + `project Project?` relation to `Session` and `TokenEvent`.
3. Add indexes.
4. Run `prisma migrate dev --name add-projects-and-nullable-project-id`.

### Phase 2: Data backfill

A standalone script: `packages/api/prisma/backfill-projects.ts`.

Algorithm:
```typescript
// 1. For each distinct (orgId, projectSlug) in Session, upsert a Project row.
const distinctPairs = await prisma.session.findMany({
  select: { orgId: true, projectSlug: true },
  distinct: ['orgId', 'projectSlug'],
});
for (const { orgId, projectSlug } of distinctPairs) {
  await prisma.project.upsert({
    where: { orgId_slug: { orgId, slug: projectSlug } },
    update: {},
    create: { orgId, slug: projectSlug, name: projectSlug, status: 'ACTIVE' },
  });
}

// 2. Same for TokenEvent (in case of TokenEvents for sessions already pruned).
const distinctEventPairs = await prisma.tokenEvent.findMany({
  select: { orgId: true, projectSlug: true },
  distinct: ['orgId', 'projectSlug'],
});
for (const { orgId, projectSlug } of distinctEventPairs) {
  await prisma.project.upsert({
    where: { orgId_slug: { orgId, slug: projectSlug } },
    update: {},
    create: { orgId, slug: projectSlug, name: projectSlug, status: 'ACTIVE' },
  });
}

// 3. Update every Session row: SET project_id = (SELECT id FROM projects WHERE org_id = sessions.org_id AND slug = sessions.project_slug)
await prisma.$executeRawUnsafe(`
  UPDATE sessions
  SET project_id = projects.id
  FROM projects
  WHERE sessions.org_id = projects.org_id
    AND sessions.project_slug = projects.slug
    AND sessions.project_id IS NULL;
`);

// 4. Same for TokenEvent.
await prisma.$executeRawUnsafe(`
  UPDATE token_events
  SET project_id = projects.id
  FROM projects
  WHERE token_events.org_id = projects.org_id
    AND token_events.project_slug = projects.slug
    AND token_events.project_id IS NULL;
`);
```

Verification: count `Session WHERE project_id IS NULL` and `TokenEvent WHERE project_id IS NULL` after run. Both must be zero before phase 3.

### Phase 3: Make `projectId` non-null

Edit `schema.prisma` to drop the `?` from `projectId String` and `project Project` on both `Session` and `TokenEvent`. Run `prisma migrate dev --name make-project-id-required`.

### Phase 4: Migrate rule scopes

Another standalone script: `packages/api/prisma/migrate-rule-scopes.ts`.

For each rule where `type = 'COST_CAP_PROJECT'` and `scope` has a `projectName` key:

```typescript
const rules = await prisma.rule.findMany({
  where: { type: 'COST_CAP_PROJECT' },
});
for (const rule of rules) {
  const scope = rule.scope as { projectName?: string; projectId?: string };
  if (!scope.projectName || scope.projectId) continue;

  const project = await prisma.project.findUnique({
    where: { orgId_slug: { orgId: rule.orgId, slug: scope.projectName } },
  });
  if (!project) {
    console.warn(`Rule ${rule.id}: no project found for slug "${scope.projectName}" in org ${rule.orgId} — disabling rule`);
    await prisma.rule.update({
      where: { id: rule.id },
      data: { enabled: false, scope: { ...scope, _migrationNote: 'orphaned-projectName' } },
    });
    continue;
  }

  await prisma.rule.update({
    where: { id: rule.id },
    data: { scope: { projectId: project.id } },
  });
}
```

### Phase 5: Redis key reset

Existing Redis counters use key `pulse:project_cost:${orgId}:${slug}:${period}`. The new format is `pulse:project_cost:${orgId}:${projectId}:${period}`. Instead of a rewrite:

- Change the key format in `rule-engine.ts` and `ws-server.ts`.
- Rely on natural expiry (daily keys reset at midnight, weekly/monthly at their period).
- The cache-miss fallback rebuilds counts from Postgres aggregation on first evaluation after the change.
- Stale keys under the old format become orphans that TTL themselves out (25h / 8d / 32d).

This is acceptable because a missed rule evaluation on the first hour after rollout worst-case under-reports project spend by one evaluation window — the aggregation fallback catches it on next event.

---

## 7. Backward Compatibility

### Agent protocol

No change. The agent continues to send `projectSlug` (derived from cwd basename) on `session_start` and `token_event`. The API auto-creates a `Project` row on first sight via `upsert({ where: { orgId_slug } })`. Existing agent binaries running in production keep working.

Follow-up (v1.5, documented as non-goal): add an optional `--project-id` flag so users can pin a cwd to a pre-created project with custom metadata. The wire format gains an optional `projectId` field that, when present, skips the slug-based resolution.

### Existing rules

Handled by the Phase 4 migration script. Orphan rules (where `projectName` doesn't match any project) are disabled with a `_migrationNote` breadcrumb, never deleted — users can re-home them manually.

### Existing sessions/events

Handled by the Phase 2 backfill. After Phase 3, every row has `projectId` populated and the column is non-null.

### Frontend display

The shared `Session` type keeps `projectSlug` AND gains optional `projectId`. Old components that group/filter by `projectSlug` keep working; new components use `projectId`. We migrate consumers one at a time; no big-bang rewrite required.

---

## 8. Open Questions / Trade-offs Resolved

| Question | Decision | Why |
|---|---|---|
| cuid vs uuid for Project PK? | **cuid** | Matches Organization/User/ApiKey/Rule. |
| Keep `projectSlug` on Session and TokenEvent? | **Keep (denormalized)** | WS hot path, historical fidelity, low drift (slug is immutable). |
| Project slug globally unique or per-org? | **Per-org** (`@@unique([orgId, slug])`) | Two orgs both calling their project `my-app` is fine. |
| Immutable slug or allow rename? | **Immutable** | Keeps the denormalized `Session.projectSlug` accurate forever. Users wanting a new slug create a new project. |
| Budget: materialize a rule or implicit check? | **Materialize** | Reuses existing rule-engine evaluation, Redis caching, alert plumbing. Visible in the Rules list. |
| Auto-create Project on first agent message? | **Yes** (via Prisma `upsert`) | Preserves zero-config UX. Race-safe via `@@unique`. |
| Redis key format migration path? | **Change format, let old keys TTL** | Daily keys reset at midnight anyway; cache-miss falls back to DB aggregation. |
| Cascade delete sessions on project archive? | **No**, soft archive only | Historical data is precious. |
| Per-project RBAC? | **No (out of scope)** | Org-level roles suffice for v1. |
| Agent wire protocol change? | **No** | Slug-only is enough; auto-create handles the rest. Optional `projectId` override deferred to v1.5. |

---

## 9. Testing Strategy

### Unit tests

- **Project route CRUD.** Create/read/update/delete/restore with role enforcement (MEMBER gets 403 on writes). Slug validation, slug immutability on PATCH, unique constraint → 409.
- **Auto-create on startSession.** Given a new slug, verify a Project row is created. Given an existing slug, verify no duplicate. Race: fire 10 concurrent startSession calls with the same slug in the same org and assert exactly one project row.
- **Tenant isolation for Project.** Org A's project can't be read/written by a tenant-scoped client for Org B. This is the sub-project 5 equivalent of Task 13 from sub-project 4.
- **Rule engine `matchesScope`.** New test cases: `scope.projectId` matches when `session.projectId === rule.scope.projectId`. Back-compat test: `scope.projectName` case is removed from the engine (migration handled separately) — rules with legacy scope are either migrated or disabled, engine only handles `projectId`.
- **Budget auto-materialize.** PATCH project with `monthlyBudgetUsd=50` creates a matching rule. PATCH with `null` deletes it. Archive project → rule disabled.
- **Redis key rewrite.** `ws-server.ts` increments `pulse:project_cost:${orgId}:${projectId}:${period}` — verified with a mocked Redis pipeline.

### Integration tests

- Full agent → API flow: agent sends `session_start` with a novel slug. Assert: Project exists, Session linked, dashboard list contains it, rules engine evaluates project-scoped rules correctly.
- `GET /api/sessions/history?projectId=X` only returns sessions with that projectId (tenant + project filter both enforced).
- Cross-tenant: create Project in Org A, try to read it via Org B auth. 404.

### Migration tests

- Backfill script on a fixture DB with 3 orgs × 5 slugs × mixed sessions/events. Verify:
  - Project table has exactly 15 rows (3 × 5).
  - Every Session/TokenEvent has `projectId` populated.
  - Counts match the distinct pairs.
- Rule scope migration on a fixture with one valid and one orphaned `projectName`-scoped rule. Verify valid one gets `scope.projectId`, orphan gets `enabled=false` with `_migrationNote`.

### Manual QA

- Create a project, set a budget, run an agent session that exceeds it, confirm an alert fires and (if ALERT action) the dashboard shows it.
- Archive a project, verify:
  - It disappears from `/projects` default view but appears under "Archived" filter.
  - Its rules are disabled.
  - Historical sessions still render on `/sessions` with their slug shown.
- Rename a session's project display name via settings — verify the session detail and table reflect the new name while the slug stays put.

---