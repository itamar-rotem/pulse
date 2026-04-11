# Multi-Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote "project" from a free-text `projectSlug` string to a first-class `Project` entity scoped to an Organization. Add project CRUD, per-project budgets (via auto-materialized rules), dashboard filters by project, and zero-config auto-creation on first agent use.

**Architecture:** `Project` is a tenant-scoped model with `@@unique([orgId, slug])`. `Session` and `TokenEvent` both gain a `projectId` FK (non-null after backfill) while keeping `projectSlug` as a denormalized column for hot-path performance and historical fidelity. The `COST_CAP_PROJECT` rule type switches from `scope.projectName` (string match) to `scope.projectId` (FK lookup). Rules with legacy scopes are auto-migrated. Redis project-cost counters switch key format and let the old keys TTL out.

**Tech stack:** No new runtime dependencies. Prisma 6, Express 5, Next.js 16, Clerk (already in place from sub-project 4).

**Pre-reqs:**
- Sub-project 4 (auth & multi-tenant) is on master.
- `tenant-prisma.ts` and `TENANT_MODELS` exist and gate every tenant-scoped query.
- Every existing tenant-scoped model already has `orgId`.

---

### Task 1: Schema Migration — Add `Project` Model + Nullable `projectId` on Session/TokenEvent

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

**Context:** First migration phase. We add the `Project` model, the `ProjectStatus` enum, the `projects` back-ref on `Organization`, and a nullable `projectId` FK on `Session` and `TokenEvent`. The FK is nullable so the backfill in Task 2 can populate it before Task 3 flips it to non-null.

- [ ] **Step 1: Add the `ProjectStatus` enum and `Project` model**

Add to `packages/api/prisma/schema.prisma` (after the `Webhook` model):

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
  color            String?
  icon             String?
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

- [ ] **Step 2: Add `projects` back-ref on `Organization`**

In the `Organization` model, add:
```prisma
  projects    Project[]
```
next to the existing back-refs.

- [ ] **Step 3: Add nullable `projectId` to `Session`**

In the `Session` model, add after `projectSlug`:
```prisma
  projectId           String?       @map("project_id")
  project             Project?      @relation(fields: [projectId], references: [id])
```
And add an index block entry:
```prisma
  @@index([projectId])
  @@index([orgId, projectId, startedAt])
```

- [ ] **Step 4: Add nullable `projectId` to `TokenEvent`**

Same pattern. In `TokenEvent`:
```prisma
  projectId              String?       @map("project_id")
  project                Project?      @relation(fields: [projectId], references: [id])
```
Indexes:
```prisma
  @@index([projectId])
  @@index([orgId, projectId, timestamp])
```

- [ ] **Step 5: Generate and apply migration**

```bash
cd packages/api && npx prisma migrate dev --name add-projects-and-nullable-project-id
```

- [ ] **Step 6: Run build to confirm types regenerate**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build
```

Some existing code will fail to compile at this stage because new `projectId` fields are present but not supplied in creates. That is expected — subsequent tasks fix it. If the error volume is large, temporarily cast with `as any` in session-service.ts just enough to get the build green, or skip to Task 2 and handle it holistically in Task 6. Prefer skipping: schema migrations don't need the build to pass, only `prisma migrate dev`.

- [ ] **Step 7: Commit**

```bash
git add packages/api/prisma/
git commit -m "feat(api): add Project model and nullable projectId FK on Session/TokenEvent"
```

---

### Task 2: Backfill Script — Populate Projects + Session/TokenEvent.projectId

**Files:**
- Create: `packages/api/prisma/backfill-projects.ts`

**Context:** All existing rows have `projectSlug` but `projectId IS NULL`. We create one `Project` row per distinct `(orgId, projectSlug)` pair (from both Session and TokenEvent, in case of orphaned events) and then bulk-update the FK columns via raw SQL for performance.

- [ ] **Step 1: Create the backfill script**

Create `packages/api/prisma/backfill-projects.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Backfill: collecting distinct (orgId, projectSlug) pairs from Session...');
  const sessionPairs = await prisma.session.findMany({
    select: { orgId: true, projectSlug: true },
    distinct: ['orgId', 'projectSlug'],
  });
  console.log(`  found ${sessionPairs.length} distinct pairs in sessions`);

  console.log('Backfill: collecting distinct (orgId, projectSlug) pairs from TokenEvent...');
  const eventPairs = await prisma.tokenEvent.findMany({
    select: { orgId: true, projectSlug: true },
    distinct: ['orgId', 'projectSlug'],
  });
  console.log(`  found ${eventPairs.length} distinct pairs in token_events`);

  const seen = new Set<string>();
  const allPairs: Array<{ orgId: string; projectSlug: string }> = [];
  for (const p of [...sessionPairs, ...eventPairs]) {
    const key = `${p.orgId}::${p.projectSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allPairs.push(p);
  }
  console.log(`Backfill: ${allPairs.length} unique (org, slug) pairs to upsert`);

  let created = 0;
  for (const { orgId, projectSlug } of allPairs) {
    const result = await prisma.project.upsert({
      where: { orgId_slug: { orgId, slug: projectSlug } },
      update: {},
      create: {
        orgId,
        slug: projectSlug,
        name: projectSlug,
        status: 'ACTIVE',
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
  }
  console.log(`Backfill: upserted projects (${created} newly created)`);

  console.log('Backfill: setting sessions.project_id from matching project...');
  const sessionsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE sessions
    SET project_id = projects.id
    FROM projects
    WHERE sessions.org_id = projects.org_id
      AND sessions.project_slug = projects.slug
      AND sessions.project_id IS NULL;
  `);
  console.log(`  updated ${sessionsUpdated} sessions`);

  console.log('Backfill: setting token_events.project_id from matching project...');
  const eventsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE token_events
    SET project_id = projects.id
    FROM projects
    WHERE token_events.org_id = projects.org_id
      AND token_events.project_slug = projects.slug
      AND token_events.project_id IS NULL;
  `);
  console.log(`  updated ${eventsUpdated} token events`);

  const remainingSessions = await prisma.session.count({ where: { projectId: null } });
  const remainingEvents = await prisma.tokenEvent.count({ where: { projectId: null } });
  console.log(`Verification: sessions with null projectId = ${remainingSessions}`);
  console.log(`Verification: token_events with null projectId = ${remainingEvents}`);

  if (remainingSessions > 0 || remainingEvents > 0) {
    console.error('FAIL: backfill did not cover all rows. Investigate before proceeding to Task 3.');
    process.exit(1);
  }
  console.log('Backfill complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the backfill**

```bash
cd packages/api && npx tsx prisma/backfill-projects.ts
```

Expected output: distinct pair count matches your dataset, both `remainingSessions` and `remainingEvents` equal zero.

- [ ] **Step 3: Commit**

```bash
git add packages/api/prisma/backfill-projects.ts
git commit -m "feat(api): add backfill script to populate projects and Session/TokenEvent.projectId"
```

---

### Task 3: Schema Migration — Make `projectId` Non-Null

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

**Context:** After Task 2, every row has `projectId`. Flip the column to non-null and tighten the relation type.

- [ ] **Step 1: Drop the `?` on `Session.projectId`**

Change:
```prisma
  projectId           String?       @map("project_id")
  project             Project?      @relation(fields: [projectId], references: [id])
```
to:
```prisma
  projectId           String        @map("project_id")
  project             Project       @relation(fields: [projectId], references: [id])
```

- [ ] **Step 2: Drop the `?` on `TokenEvent.projectId`**

Same edit in the `TokenEvent` model.

- [ ] **Step 3: Generate and apply migration**

```bash
cd packages/api && npx prisma migrate dev --name make-project-id-required
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/prisma/
git commit -m "feat(api): make projectId non-null on Session and TokenEvent"
```

---

### Task 4: Rule Scope Migration — `projectName` → `projectId`

**Files:**
- Create: `packages/api/prisma/migrate-rule-scopes.ts`
- Modify: `packages/shared/src/intelligence-types.ts` (update `RuleScope`)

**Context:** `RuleScope.projectName` becomes `RuleScope.projectId`. We migrate existing rules first via a script, then update the type and the engine. Orphaned rules (whose projectName doesn't match any project slug in their org) are disabled with a breadcrumb.

- [ ] **Step 1: Create the rule-scope migration script**

Create `packages/api/prisma/migrate-rule-scopes.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.rule.findMany({
    where: { type: 'COST_CAP_PROJECT' },
  });
  console.log(`Found ${rules.length} COST_CAP_PROJECT rules`);

  let migrated = 0;
  let orphaned = 0;
  let skipped = 0;

  for (const rule of rules) {
    const scope = rule.scope as { projectName?: string; projectId?: string; [k: string]: unknown };
    if (scope.projectId) { skipped++; continue; }
    if (!scope.projectName) { skipped++; continue; }

    const project = await prisma.project.findUnique({
      where: { orgId_slug: { orgId: rule.orgId, slug: scope.projectName } },
    });

    if (!project) {
      console.warn(`  rule ${rule.id}: orphan projectName="${scope.projectName}" in org ${rule.orgId} — disabling`);
      await prisma.rule.update({
        where: { id: rule.id },
        data: {
          enabled: false,
          scope: { ...scope, _migrationNote: 'orphaned-projectName' } as any,
        },
      });
      orphaned++;
      continue;
    }

    await prisma.rule.update({
      where: { id: rule.id },
      data: { scope: { projectId: project.id } as any },
    });
    migrated++;
  }

  console.log(`Done. migrated=${migrated} orphaned=${orphaned} skipped=${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the script**

```bash
cd packages/api && npx tsx prisma/migrate-rule-scopes.ts
```

- [ ] **Step 3: Update `RuleScope` type in shared**

Edit `packages/shared/src/intelligence-types.ts`:

```typescript
export interface RuleScope {
  projectId?: string;
  sessionType?: string;
  global?: boolean;
}
```

(Remove `projectName?: string`.)

- [ ] **Step 4: Build**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build
```

Compile errors in `rule-engine.ts`, `insight-generator.ts`, and `packages/web/src/app/rules/page.tsx` are expected — fixed in later tasks. Note them in a scratchpad and proceed.

- [ ] **Step 5: Commit**

```bash
git add packages/api/prisma/migrate-rule-scopes.ts packages/shared/src/intelligence-types.ts
git commit -m "feat(api,shared): migrate rule scopes from projectName to projectId"
```

---

### Task 5: Add `Project` to Tenant-Scoped Models + Tenant-Isolation Test

**Files:**
- Modify: `packages/api/src/services/tenant-prisma.ts`
- Create: `packages/api/tests/tenant-project-isolation.test.ts`

**Context:** The tenant Prisma extension must include `Project` in `TENANT_MODELS` so every read/write through `req.prisma` is auto-filtered by `orgId`. This is the sub-project 5 equivalent of sub-project 4's Task 13 safety net.

- [ ] **Step 1: Add `Project` to `TENANT_MODELS`**

In `packages/api/src/services/tenant-prisma.ts`:

```typescript
const TENANT_MODELS = new Set([
  'Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook', 'ApiKey', 'Project',
]);
```

- [ ] **Step 2: Write cross-tenant isolation test**

Create `packages/api/tests/tenant-project-isolation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $extends: vi.fn(),
}));

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('Project tenant isolation via createTenantPrisma', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects orgId into Project.findMany where clause', () => {
    let handler: Function | undefined;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      handler = ext.query.$allOperations;
      return {};
    });
    createTenantPrisma('org-A');

    const mockQuery = vi.fn((a: any) => a);
    const args: any = { where: { status: 'ACTIVE' } };
    handler!({ args, query: mockQuery, operation: 'findMany', model: 'Project' });
    expect(args.where).toEqual({ status: 'ACTIVE', orgId: 'org-A' });
  });

  it('injects orgId into Project.create data', () => {
    let handler: Function | undefined;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      handler = ext.query.$allOperations;
      return {};
    });
    createTenantPrisma('org-B');

    const mockQuery = vi.fn((a: any) => a);
    const args: any = { data: { slug: 'my-app', name: 'My App' } };
    handler!({ args, query: mockQuery, operation: 'create', model: 'Project' });
    expect(args.data).toEqual({ slug: 'my-app', name: 'My App', orgId: 'org-B' });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/tenant-prisma.ts packages/api/tests/tenant-project-isolation.test.ts
git commit -m "feat(api): add Project to tenant-scoped models with isolation test"
```

---

### Task 6: Project CRUD Routes + Budget Rule Auto-Materialization

**Files:**
- Create: `packages/api/src/routes/projects.ts`
- Create: `packages/api/src/services/project-service.ts`
- Create: `packages/api/tests/routes/projects.test.ts`
- Modify: `packages/api/src/app.ts` (mount router)

**Context:** REST API for project management. Reads available to all roles; writes require OWNER/ADMIN. Budget-rule materialization is a service helper called on `POST` and `PATCH`.

- [ ] **Step 1: Create the project service**

Create `packages/api/src/services/project-service.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { prisma as globalPrisma } from './prisma.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * Race-safe project upsert used on the agent hot path.
 * Called with global prisma + explicit orgId (not tenant client) because the
 * compound unique `where` does not reliably auto-inject orgId via the extension.
 */
export async function upsertProjectForAgent(
  orgId: string,
  slug: string,
): Promise<{ id: string; slug: string }> {
  return globalPrisma.project.upsert({
    where: { orgId_slug: { orgId, slug } },
    update: {},
    create: { orgId, slug, name: slug, status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
}

/** Sync a COST_CAP_PROJECT rule materialized from `monthlyBudgetUsd`. */
export async function syncBudgetRule(
  orgId: string,
  projectId: string,
  projectName: string,
  monthlyBudgetUsd: number | null,
  db: PrismaClient,
) {
  // Find any existing materialized rule for this project.
  const existing = await db.rule.findFirst({
    where: {
      type: 'COST_CAP_PROJECT',
      scope: { path: ['projectId'], equals: projectId },
    },
  });

  if (monthlyBudgetUsd == null || monthlyBudgetUsd <= 0) {
    if (existing) await db.rule.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await db.rule.update({
      where: { id: existing.id },
      data: {
        name: `Budget: ${projectName}`,
        condition: { maxCost: monthlyBudgetUsd, period: 'monthly' },
        enabled: true,
      },
    });
  } else {
    await db.rule.create({
      data: {
        name: `Budget: ${projectName}`,
        type: 'COST_CAP_PROJECT',
        scope: { projectId } as any,
        condition: { maxCost: monthlyBudgetUsd, period: 'monthly' } as any,
        action: 'ALERT',
        enabled: true,
      },
    });
  }
}

/** Disable (not delete) budget rules for an archived project. */
export async function disableBudgetRule(
  projectId: string,
  db: PrismaClient,
) {
  await db.rule.updateMany({
    where: {
      type: 'COST_CAP_PROJECT',
      scope: { path: ['projectId'], equals: projectId },
    },
    data: { enabled: false },
  });
}
```

- [ ] **Step 2: Create the projects route**

Create `packages/api/src/routes/projects.ts`:

```typescript
import { Router, IRouter } from 'express';
import { requireRole } from '../middleware/require-role.js';
import {
  validateSlug,
  syncBudgetRule,
  disableBudgetRule,
} from '../services/project-service.js';

export const projectsRouter: IRouter = Router();

// GET /api/projects?status=active|archived|all&q=&page=&limit=
projectsRouter.get('/', async (req, res) => {
  try {
    const status = (req.query.status as string) || 'active';
    const q = req.query.q as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const where: Record<string, unknown> = {};
    if (status === 'active') where.status = 'ACTIVE';
    else if (status === 'archived') where.status = 'ARCHIVED';
    if (q) {
      where.OR = [
        { slug: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      req.prisma!.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      req.prisma!.project.count({ where }),
    ]);

    res.json({ projects, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/projects/:id — includes 30d cost + session count aggregates
projectsRouter.get('/:id', async (req, res) => {
  try {
    const project = await req.prisma!.project.findUnique({
      where: { id: req.params.id },
    });
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [sessionAgg, activeCount] = await Promise.all([
      req.prisma!.session.aggregate({
        where: { projectId: project.id, startedAt: { gte: thirtyDaysAgo } },
        _count: true,
        _sum: { costUsd: true },
      }),
      req.prisma!.session.count({
        where: { projectId: project.id, endedAt: null },
      }),
    ]);

    res.json({
      ...project,
      stats: {
        sessions30d: sessionAgg._count,
        cost30d: sessionAgg._sum.costUsd ?? 0,
        activeSessions: activeCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/projects
projectsRouter.post('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { slug, name, description, color, icon, monthlyBudgetUsd } = req.body;
    if (!slug || typeof slug !== 'string' || !validateSlug(slug)) {
      res.status(400).json({ error: 'slug required and must match /^[a-z0-9][a-z0-9-_]{0,63}$/' });
      return;
    }

    const created = await req.prisma!.project.create({
      data: {
        slug,
        name: name || slug,
        description: description ?? null,
        color: color ?? null,
        icon: icon ?? null,
        monthlyBudgetUsd: typeof monthlyBudgetUsd === 'number' ? monthlyBudgetUsd : null,
        status: 'ACTIVE',
      },
    });

    if (typeof monthlyBudgetUsd === 'number' && monthlyBudgetUsd > 0) {
      await syncBudgetRule(req.auth!.orgId, created.id, created.name, monthlyBudgetUsd, req.prisma!);
    }

    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Unique constraint')) {
      res.status(409).json({ error: 'A project with that slug already exists in this organization' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/projects/:id
projectsRouter.patch('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    if ('slug' in req.body) {
      res.status(400).json({ error: 'slug is immutable. Create a new project to change the slug.' });
      return;
    }

    const { name, description, color, icon, monthlyBudgetUsd, status, metadata } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (color !== undefined) data.color = color;
    if (icon !== undefined) data.icon = icon;
    if (monthlyBudgetUsd !== undefined) data.monthlyBudgetUsd = monthlyBudgetUsd;
    if (metadata !== undefined) data.metadata = metadata;
    if (status !== undefined) {
      data.status = status;
      data.archivedAt = status === 'ARCHIVED' ? new Date() : null;
    }

    const updated = await req.prisma!.project.update({
      where: { id: req.params.id },
      data,
    });

    if (monthlyBudgetUsd !== undefined) {
      await syncBudgetRule(
        req.auth!.orgId,
        updated.id,
        updated.name,
        typeof monthlyBudgetUsd === 'number' ? monthlyBudgetUsd : null,
        req.prisma!,
      );
    }
    if (status === 'ARCHIVED') {
      await disableBudgetRule(updated.id, req.prisma!);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/projects/:id (soft delete → archive)
projectsRouter.delete('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const updated = await req.prisma!.project.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await disableBudgetRule(updated.id, req.prisma!);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/projects/:id/restore
projectsRouter.post('/:id/restore', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const updated = await req.prisma!.project.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', archivedAt: null },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 3: Mount the router in `app.ts`**

Add to imports:
```typescript
import { projectsRouter } from './routes/projects.js';
```
And mount alongside the other auth+tenant routes:
```typescript
app.use('/api/projects', authMiddleware, tenantMiddleware, projectsRouter);
```

- [ ] **Step 4: Write tests**

Create `packages/api/tests/routes/projects.test.ts` covering:
- `POST /projects` with valid slug → 201
- `POST` with invalid slug format → 400
- `POST` with duplicate slug → 409
- `PATCH` body including `slug` → 400
- `PATCH` with `monthlyBudgetUsd: 50` → creates matching Rule
- `PATCH` with `monthlyBudgetUsd: null` → deletes matching Rule
- `DELETE /projects/:id` → sets `status='ARCHIVED'` and disables budget rule
- `POST /projects/:id/restore` → sets `status='ACTIVE'`
- Role enforcement: MEMBER → 403 on POST/PATCH/DELETE

Follow the pattern from `packages/api/tests/routes/api-keys.test.ts`.

- [ ] **Step 5: Run tests + build**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test
```

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/projects.ts packages/api/src/services/project-service.ts packages/api/src/app.ts packages/api/tests/routes/projects.test.ts
git commit -m "feat(api): add project CRUD routes with budget auto-materialization"
```

---

### Task 7: Session Service + WS Server — Auto-Create Project on First Use

**Files:**
- Modify: `packages/api/src/services/session-service.ts`
- Modify: `packages/api/src/ws-server.ts`

**Context:** `startSession` currently takes `projectSlug` and writes it straight into the Session row. It must now also resolve a `projectId` by upserting a Project (scoped to the org). `updateSession` must look up the Session's existing `projectId` or fall back to a resolve (to handle the edge case where a `token_event` arrives before the `session_start` was persisted). The `ws-server.ts` project-cost Redis key format changes from slug to projectId.

- [ ] **Step 1: Update `startSession` to resolve projectId**

In `packages/api/src/services/session-service.ts`:

```typescript
import { upsertProjectForAgent } from './project-service.js';

export async function startSession(
  data: {
    id: string;
    tool: string;
    projectSlug: string;
    sessionType: string;
    model: string;
    orgId: string;        // NEW: explicit orgId for the project upsert (comes from ws.orgId)
  },
  db: PrismaClient,
) {
  const project = await upsertProjectForAgent(data.orgId, data.projectSlug);

  const session = await db.session.create({
    data: {
      id: data.id,
      tool: data.tool,
      projectSlug: data.projectSlug,
      projectId: project.id,
      sessionType: data.sessionType,
      model: data.model,
    } as any,
  });
  await publishSessionUpdate(session);
  return session;
}
```

- [ ] **Step 2: Update `updateSession` to copy projectId from session**

```typescript
export async function updateSession(
  data: {
    sessionId: string;
    // ... existing fields
    projectSlug: string;
    orgId: string;       // NEW
    sessionType: string;
  },
  db: PrismaClient,
) {
  // Look up the session (already-scoped via db). If the session exists, reuse its projectId.
  const existing = await db.session.findUnique({
    where: { id: data.sessionId },
    select: { projectId: true },
  });
  const projectId = existing?.projectId
    ?? (await upsertProjectForAgent(data.orgId, data.projectSlug)).id;

  const event = await db.tokenEvent.create({
    data: {
      sessionId: data.sessionId,
      tool: data.tool,
      model: data.model,
      projectSlug: data.projectSlug,
      projectId,
      sessionType: data.sessionType,
      // ... existing token fields
    } as any,
  });
  // ... rest unchanged
}
```

- [ ] **Step 3: Update `ws-server.ts` callers to pass orgId**

In `handleAgentMessage`, the `startSession` and `updateSession` calls need `orgId: orgId` added to the payload. Example:

```typescript
await startSession({
  id: sessionId,
  tool: msg.data.tool as string,
  projectSlug: msg.data.projectSlug as string,
  sessionType: msg.data.sessionType as string,
  model: msg.data.model as string,
  orgId,
}, db).catch(() => {});
```

- [ ] **Step 4: Change the project-cost Redis key format to use projectId**

In `packages/api/src/ws-server.ts`, find the project cost counter loop. It currently reads `d.projectSlug` for the key. Replace with the resolved project id. Because the Session/TokenEvent write already happened, we can reuse `result.event.projectId`:

```typescript
const projectId = result.event.projectId;
if (projectId) {
  const periods: Array<['daily' | 'weekly' | 'monthly', number]> = [
    ['daily', 90000],
    ['weekly', 691200],
    ['monthly', 2764800],
  ];
  for (const [period, ttl] of periods) {
    const key = `pulse:project_cost:${orgId}:${projectId}:${period}`;
    const pipeline = redis.pipeline();
    pipeline.incrbyfloat(key, cost);
    pipeline.expire(key, ttl, 'NX');
    pipeline.exec().catch(() => {});
  }
}
```

Old keys under the slug format will TTL out naturally. Document this as a known minor under-count on the first evaluation window.

- [ ] **Step 5: Update the `SessionContext` in rule-engine to include projectId**

(Prepares for Task 8 — just the type change here.)

In `packages/api/src/services/intelligence/rule-engine.ts`, update the interface:
```typescript
interface SessionContext {
  id: string;
  costUsd: number;
  projectSlug: string;
  projectId: string;  // NEW
  sessionType: string;
  startedAt: Date | string;
}
```

- [ ] **Step 6: Update ws-server’s rule-engine call site to pass projectId**

The `ruleEngine.evaluate(d as any, result.session as any, orgId)` call: verify `result.session` already has `projectId` on it (it does, because the Session row has the column). No change needed if the typecast is wide; otherwise add explicit shaping.

- [ ] **Step 7: Run build + tests**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test
```

Fix any existing session-service tests whose `startSession`/`updateSession` callers now need `orgId` — add it to the test payloads.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/session-service.ts packages/api/src/services/intelligence/rule-engine.ts packages/api/src/ws-server.ts
git commit -m "feat(api): auto-create Project on first agent use and switch Redis cost key to projectId"
```

---

### Task 8: Rule Engine — Use `scope.projectId` for COST_CAP_PROJECT

**Files:**
- Modify: `packages/api/src/services/intelligence/rule-engine.ts`
- Modify: `packages/api/tests/rule-engine.test.ts`

**Context:** With `RuleScope` now having `projectId` instead of `projectName`, `matchesScope` and `checkCostCapProject` must be rewritten.

- [ ] **Step 1: Rewrite `matchesScope`**

```typescript
private matchesScope(scope: RuleScope, session: SessionContext, _event: EventContext): boolean {
  if (scope.global) return true;
  if (scope.projectId && session.projectId !== scope.projectId) return false;
  if (scope.sessionType && session.sessionType !== scope.sessionType) return false;
  return !!(scope.projectId || scope.sessionType);
}
```

- [ ] **Step 2: Rewrite `checkCostCapProject`**

```typescript
private async checkCostCapProject(rule: CachedRule, session: SessionContext): Promise<RuleViolation | null> {
  const maxCost = rule.condition.maxCost ?? Infinity;
  const period = rule.condition.period ?? 'daily';
  const scope = rule.scope as RuleScope;
  const projectId = scope.projectId ?? session.projectId;
  const cacheKey = `pulse:project_cost:${rule.orgId}:${projectId}:${period}`;

  let projectCost = 0;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    projectCost = parseFloat(cached);
  } else {
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
    const result = await globalPrisma.session.aggregate({
      where: {
        orgId: rule.orgId,
        projectId,
        startedAt: { gte: periodStart },
      },
      _sum: { costUsd: true },
    });
    projectCost = result._sum.costUsd ?? 0;
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

- [ ] **Step 3: Update the rule-engine unit tests**

In `packages/api/tests/rule-engine.test.ts`, replace any `scope: { projectName: 'foo' }` with `scope: { projectId: 'proj-1' }` and ensure test fixtures for `session` include `projectId`.

- [ ] **Step 4: Run tests**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/intelligence/rule-engine.ts packages/api/tests/rule-engine.test.ts
git commit -m "feat(api): rule engine uses scope.projectId for COST_CAP_PROJECT"
```

---

### Task 9: Dashboard/Sessions Route Filters — `?projectId=`

**Files:**
- Modify: `packages/api/src/services/session-service.ts`
- Modify: `packages/api/src/routes/sessions.ts`
- Modify: `packages/api/src/routes/dashboard.ts`
- Modify: `packages/api/src/routes/alerts.ts`
- Modify: `packages/api/src/routes/insights.ts`

**Context:** Add `projectId` query-param filtering to the read routes that back the frontend. The tenant extension already scopes by orgId; `projectId` is an additional narrowing filter.

- [ ] **Step 1: Update `getSessionHistory` to support `projectId`**

In `session-service.ts`:
```typescript
export async function getSessionHistory(
  query: {
    page?: number;
    limit?: number;
    tool?: string;
    projectSlug?: string;   // deprecated but preserved
    projectId?: string;     // NEW preferred
    sessionType?: string;
    startDate?: string;
    endDate?: string;
  },
  db: PrismaClient,
) {
  // ...
  if (query.projectId) where.projectId = query.projectId;
  if (query.projectSlug) where.projectSlug = query.projectSlug;
  // ...
}
```

- [ ] **Step 2: Update `getLiveSummary` to accept a projectId filter**

```typescript
export async function getLiveSummary(
  db: PrismaClient,
  opts: { projectId?: string } = {},
) {
  const projectFilter = opts.projectId ? { projectId: opts.projectId } : {};
  // thread projectFilter into every where clause in the function
}
```

- [ ] **Step 3: Update `/api/dashboard/live-summary` route handler**

```typescript
dashboardRouter.get('/live-summary', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const summary = await getLiveSummary(req.prisma!, { projectId });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 4: Update `/api/alerts` to support projectId filter**

Read `req.query.projectId`. If set, filter alerts whose `session.projectId` matches (alerts without a `sessionId` are excluded when filter is set). Use a nested where:

```typescript
if (projectId) where.session = { is: { projectId } };
```

- [ ] **Step 5: Update `/api/insights` to support projectId filter**

Filter insights whose `metadata.projectId` matches (because insights are organized by metadata, not a direct FK). Use Prisma JSON path filter:

```typescript
if (projectId) where.metadata = { path: ['projectId'], equals: projectId };
```

Note: the insight-generator's `metadata` writes currently use `projectName` — Task 11 updates them to write `projectId` as well.

- [ ] **Step 6: Run tests + build**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test
```

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/session-service.ts packages/api/src/routes/
git commit -m "feat(api): add projectId query filter to sessions, dashboard, alerts, insights routes"
```

---

### Task 10: Frontend — Projects List + Detail + Settings Pages

**Files:**
- Create: `packages/web/src/app/projects/page.tsx`
- Create: `packages/web/src/app/projects/[id]/page.tsx`
- Create: `packages/web/src/app/projects/[id]/settings/page.tsx`
- Create: `packages/web/src/hooks/use-projects.ts`
- Create: `packages/web/src/components/projects/project-card.tsx`
- Create: `packages/web/src/components/projects/project-form.tsx`
- Create: `packages/web/src/components/projects/budget-gauge.tsx`
- Modify: `packages/web/src/components/layout/sidebar.tsx`

**Context:** First-class project UI. Reuses the existing design language (cards, pills, filters) from `/sessions` and `/rules`. See `packages/web/AGENTS.md` for Next.js 16 conventions — check `node_modules/next/dist/docs/` before writing route handlers.

- [ ] **Step 1: Create `use-projects` SWR hook**

Create `packages/web/src/hooks/use-projects.ts`:

```typescript
import useSWR from 'swr';
import { apiFetch } from '@/lib/api-client';

export interface Project {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  monthlyBudgetUsd: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export function useProjects(params: { status?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  return useSWR<{ projects: Project[]; total: number; page: number; limit: number }>(
    `/api/projects?${qs.toString()}`,
    apiFetch,
  );
}

export function useProject(id: string | undefined) {
  return useSWR<Project & { stats: { sessions30d: number; cost30d: number; activeSessions: number } }>(
    id ? `/api/projects/${id}` : null,
    apiFetch,
  );
}

export async function createProject(body: Partial<Project>) { /* POST */ }
export async function updateProject(id: string, body: Partial<Project>) { /* PATCH */ }
export async function archiveProject(id: string) { /* DELETE */ }
export async function restoreProject(id: string) { /* POST /restore */ }
```

- [ ] **Step 2: Create `/projects` list page**

Create `packages/web/src/app/projects/page.tsx`. Follow the layout pattern of `/sessions`:
- `<PageHeader title="Projects" subtitle="<N> active" ... />`
- Status filter (active/archived/all) + search input at top
- Grid of `<ProjectCard>` components
- "New project" button opens a modal with `<ProjectForm>` (OWNER/ADMIN gated via `useOrganization()` role check)

- [ ] **Step 3: Create `/projects/[id]` detail page**

Layout:
- Header with project name, slug pill, color swatch, edit/archive buttons
- Budget gauge (cost30d / monthlyBudgetUsd) if budget set
- Stats row: sessions 30d, active sessions, total cost
- Section: recent sessions (reuse `<SessionTable>` with `projectId` filter)
- Section: recent alerts (reuse the alerts component with `projectId` filter)
- Section: rules (filtered client-side where `rule.scope.projectId === id`)

- [ ] **Step 4: Create `/projects/[id]/settings` page**

Full form for name, description, color, icon, monthly budget, archive/restore toggle.

- [ ] **Step 5: Add Projects nav entry**

In `packages/web/src/components/layout/sidebar.tsx`, add inside the "Monitor" section, after "Sessions":
```tsx
import { FolderKanban } from 'lucide-react';
// ...
<NavItem href="/projects" label="Projects" icon={FolderKanban} />
```

- [ ] **Step 6: Run build**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build
```

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/app/projects/ packages/web/src/hooks/use-projects.ts packages/web/src/components/projects/ packages/web/src/components/layout/sidebar.tsx
git commit -m "feat(web): add projects list, detail, settings pages and sidebar nav"
```

---

### Task 11: Frontend — Project Filter Dropdowns on Existing Views + Rule Picker

**Files:**
- Modify: `packages/web/src/components/sessions/session-filters.tsx`
- Modify: `packages/web/src/app/sessions/page.tsx`
- Modify: `packages/web/src/app/live/page.tsx`
- Modify: `packages/web/src/app/alerts/page.tsx`
- Modify: `packages/web/src/app/insights/page.tsx`
- Modify: `packages/web/src/app/rules/page.tsx`
- Modify: `packages/web/src/components/sessions/session-detail.tsx`
- Modify: `packages/api/src/services/intelligence/insight-generator.ts`

**Context:** Wire the new projects API into filter UIs. Replace free-text project pickers with server-backed dropdowns. Update insight-generator to write `projectId` alongside `projectName` in insight metadata so the server-side filter (Task 9) works.

- [ ] **Step 1: Replace the sessions project filter with a dropdown sourced from `useProjects`**

In `packages/web/src/app/sessions/page.tsx`, replace the client-side distinct-slug memo with `const { data: projectsData } = useProjects({ status: 'active' })` and pass `projects={projectsData?.projects ?? []}` to `<SessionFilters>`. The filter state becomes `projectId` and the API call gains `?projectId=...`.

- [ ] **Step 2: Add project dropdown to `/live` page**

Add a filter bar above the session list. On change, filter `activeSessions` client-side by `projectId` and pass `?projectId=` to `useLiveSummary`.

- [ ] **Step 3: Add project dropdowns to alerts and insights pages**

Same pattern. Both pass `projectId` as a query param to their respective endpoints.

- [ ] **Step 4: Replace free-text project input in rule creation form**

In `packages/web/src/app/rules/page.tsx`:
- Replace `const [formProject, setFormProject] = useState('')` state semantics from "slug string" to "projectId string".
- Replace the text input with a `<select>` sourced from `useProjects({ status: 'active' })`.
- Update `handleCreate`:
  ```typescript
  const scope = formGlobal ? { global: true } : { projectId: formProject };
  ```
- Update `scopeDescription` to look up the project name from a loaded project list:
  ```typescript
  if (scope.projectId) {
    const p = projects?.find((pp) => pp.id === scope.projectId);
    return `Project: ${p?.name ?? '(unknown)'}`;
  }
  ```

- [ ] **Step 5: Make session detail link project to `/projects/[id]`**

In `session-detail.tsx`, wrap the project slug in a `Link` to `/projects/${session.projectId}` when `projectId` is present.

- [ ] **Step 6: Update `insight-generator.ts` to write projectId in metadata**

In `packages/api/src/services/intelligence/insight-generator.ts`, the `groupBy(['projectSlug'])` queries lose context. Switch to `groupBy(['projectId', 'projectSlug'])` (the slug is kept for display). In the insight metadata write:
```typescript
metadata: { projectId: stat.projectId, projectName: stat.projectSlug, ... }
```
And in the rule suggestion:
```typescript
scope: { projectId: stat.projectId },
```

- [ ] **Step 7: Run build + tests**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/ packages/api/src/services/intelligence/insight-generator.ts
git commit -m "feat(web,api): project filters on existing views + rule picker + insight metadata"
```

---

### Task 12: Cross-Project Isolation Safety-Net Test + Race-Safety Test

**Files:**
- Create: `packages/api/tests/project-isolation.test.ts`
- Create: `packages/api/tests/project-auto-create.test.ts`

**Context:** Sub-project 4's Task 13 established a pattern of a cross-tenant isolation safety-net test as the final guarantee. Mirror it for projects — both "org A can't see org B's projects" and "auto-create is race-safe under concurrent calls."

- [ ] **Step 1: Cross-tenant project isolation test**

Create `packages/api/tests/project-isolation.test.ts`:
- Create projects under `orgA` and `orgB` via the scoped prisma clients.
- `GET /api/projects` as orgA returns only orgA projects.
- `GET /api/projects/:id` with orgB's id as orgA auth → 404.
- `PATCH /api/projects/:id` of orgB's project as orgA → 404.
- Session with orgA's projectId scoped to orgB: verify tenant extension rejects (or returns 0 rows).

Mock the prisma client per the existing test pattern in `tenant-prisma.test.ts` and `api-keys.test.ts`.

- [ ] **Step 2: Race-safety test for `upsertProjectForAgent`**

Create `packages/api/tests/project-auto-create.test.ts`:
- Fire 10 concurrent calls to `upsertProjectForAgent(orgA, 'my-new-app')`.
- Verify exactly one row in the mocked `project.upsert` outcome (the mock should count unique constraint hits).
- Alternatively (if using integration DB): verify only one real row exists after the burst.

- [ ] **Step 3: Run tests**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/tests/project-isolation.test.ts packages/api/tests/project-auto-create.test.ts
git commit -m "test(api): cross-project isolation and auto-create race-safety"
```

---

### Task 13: Full Build + Full Test Suite + Final Commit

**Context:** Close out sub-project 5. Run the full monorepo build and test suite, fix any residual failures, and commit a final "sub-project 5 complete" marker if there are outstanding changes. Verify the end-to-end flow manually.

- [ ] **Step 1: Run the full build**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build
```

All packages (`shared`, `api`, `web`, `agent`) must build cleanly. Fix any lingering type errors.

- [ ] **Step 2: Run the full test suite**

```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test
```

- [ ] **Step 3: Manual smoke test**

With the API and web dev servers running and an agent pointed at a local org:
1. Start a Claude Code session in a new directory never seen before. Confirm a Project row is auto-created via the API.
2. Open `/projects` in the dashboard. Confirm the new project appears. Click into it.
3. Open `/projects/[id]/settings`, set `monthlyBudgetUsd: 0.50`. Run the agent long enough to exceed it. Confirm an Alert fires.
4. Archive the project. Confirm it disappears from the default `/projects` view and the materialized budget rule is disabled.
5. Restore the project.
6. On `/sessions`, filter by the project. Confirm only matching sessions show.
7. On `/rules`, create a new COST_CAP_PROJECT rule via the project dropdown. Verify the rule has `scope.projectId`.

- [ ] **Step 4: Commit any residuals**

If the manual smoke test surfaces fixes, commit them:
```bash
git add -A  # or specific files
git commit -m "fix(web,api): sub-project 5 smoke test fixes"
```

- [ ] **Step 5: Tag and document**

(Optional if the repo uses tags.) Otherwise, proceed to the next sub-project.

---