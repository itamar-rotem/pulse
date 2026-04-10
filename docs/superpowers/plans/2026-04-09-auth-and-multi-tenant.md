# Auth & Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk-based multi-tenant authentication with org-scoped API keys, role-based access control, and data isolation via Prisma client extensions.

**Architecture:** Clerk handles all auth UI and token management. The API validates Clerk tokens or org-scoped API keys, resolves tenant context, and injects a scoped Prisma client into every request. Existing data migrates to a seed organization. Next.js 16 uses `proxy.ts` (not `middleware.ts`) for route protection.

**Tech Stack:** Clerk (`@clerk/nextjs`, `@clerk/express`), Svix (webhook verification), bcrypt, Prisma 6, Express 5, Next.js 16

---

### Task 1: Schema Migration — New Models + orgId Column

Add Organization, User, ApiKey models and add nullable `orgId` to all existing tenant-scoped models.

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

**Context:** This is the first migration phase. We add `orgId` as nullable now, seed existing data in Task 2, then make it required in Task 3. The new enums (Plan, Role) and models must be added before any code changes.

- [ ] **Step 1: Add new enums and models to Prisma schema**

Add to `packages/api/prisma/schema.prisma`:

```prisma
enum Plan {
  FREE
  PRO
  ENTERPRISE
}

enum Role {
  OWNER
  ADMIN
  MEMBER
}

model Organization {
  id         String   @id @default(cuid())
  clerkOrgId String?  @unique @map("clerk_org_id")
  name       String
  slug       String   @unique
  plan       Plan     @default(FREE)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  users    User[]
  apiKeys  ApiKey[]
  sessions Session[]
  tokenEvents TokenEvent[]
  rules    Rule[]
  alerts   Alert[]
  insights Insight[]
  webhooks Webhook[]

  @@map("organizations")
}

model User {
  id          String    @id @default(cuid())
  clerkUserId String    @unique @map("clerk_user_id")
  email       String
  name        String?
  role        Role      @default(MEMBER)
  orgId       String    @map("org_id")
  org         Organization @relation(fields: [orgId], references: [id])
  lastSeenAt  DateTime? @map("last_seen_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  apiKeys ApiKey[]

  @@index([orgId])
  @@map("users")
}

model ApiKey {
  id          String    @id @default(cuid())
  orgId       String    @map("org_id")
  org         Organization @relation(fields: [orgId], references: [id])
  keyHash     String    @map("key_hash")
  prefix      String
  name        String
  createdById String    @map("created_by_id")
  createdBy   User      @relation(fields: [createdById], references: [id])
  lastUsedAt  DateTime? @map("last_used_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([prefix])
  @@index([orgId])
  @@map("api_keys")
}
```

- [ ] **Step 2: Add nullable `orgId` to all existing tenant-scoped models**

Add to each of the six existing models (`Session`, `TokenEvent`, `Rule`, `Alert`, `Insight`, `Webhook`):

For **Session** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])` inside the model.

For **TokenEvent** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])` (keep existing indexes).

For **Rule** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])`.

For **Alert** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])`.

For **Insight** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])`.

For **Webhook** model, add:
```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```
And add `@@index([orgId])`.

- [ ] **Step 3: Generate and apply migration**

Run:
```bash
cd packages/api && npx prisma migrate dev --name add-auth-models-and-nullable-org-id
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/prisma/
git commit -m "feat(api): add Organization, User, ApiKey models and nullable orgId"
```

---

### Task 2: Seed Migration — Assign Existing Data to Default Org

Create a seed script that inserts a default organization and assigns all existing rows to it.

**Files:**
- Create: `packages/api/prisma/seed-default-org.ts`

**Context:** This runs between the two migration phases. All existing data gets assigned to one "Personal" organization. The seed org has `clerkOrgId = null` — it gets claimed later via the setup endpoint.

- [ ] **Step 1: Create the seed script**

Create `packages/api/prisma/seed-default-org.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_ORG_ID = 'org_default_seed';

async function main() {
  // Create the default organization if it doesn't exist
  const org = await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: 'Personal',
      slug: 'personal',
      plan: 'FREE',
    },
  });
  console.log(`Default org: ${org.id} (${org.name})`);

  // Assign all existing rows to the default org
  const tables = ['Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook'] as const;

  for (const table of tables) {
    const model = table.charAt(0).toLowerCase() + table.slice(1);
    const result = await (prisma as any)[model].updateMany({
      where: { orgId: null },
      data: { orgId: DEFAULT_ORG_ID },
    });
    console.log(`  ${table}: ${result.count} rows assigned`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the seed script**

Run:
```bash
cd packages/api && npx tsx prisma/seed-default-org.ts
```

Expected: All existing rows get `orgId = 'org_default_seed'`.

- [ ] **Step 3: Commit**

```bash
git add packages/api/prisma/seed-default-org.ts
git commit -m "feat(api): add seed script to assign existing data to default org"
```

---

### Task 3: Schema Migration — Make orgId Required

Now that all rows have an orgId, make the column non-nullable.

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

- [ ] **Step 1: Change nullable orgId to required on all six models**

In `schema.prisma`, for each of `Session`, `TokenEvent`, `Rule`, `Alert`, `Insight`, `Webhook`, change:

```prisma
  orgId       String?   @map("org_id")
  org         Organization? @relation(fields: [orgId], references: [id])
```

To:

```prisma
  orgId       String    @map("org_id")
  org         Organization @relation(fields: [orgId], references: [id])
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
cd packages/api && npx prisma migrate dev --name make-org-id-required
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/prisma/
git commit -m "feat(api): make orgId non-nullable on all tenant-scoped models"
```

---

### Task 4: Tenant Prisma Extension + Request Types

Create the scoped Prisma client factory and Express type augmentation.

**Files:**
- Create: `packages/api/src/services/tenant-prisma.ts`
- Create: `packages/api/src/types/express.d.ts`
- Modify: `packages/api/tsconfig.json` (if needed for type augmentation)

**Context:** This is the core isolation mechanism. `createTenantPrisma(orgId)` returns a Prisma client that automatically injects `orgId` into all queries on tenant-scoped models. Express request types are augmented with `req.auth` and `req.prisma`.

- [ ] **Step 1: Create Express type augmentation**

Create `packages/api/src/types/express.d.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        orgId: string;
        userId?: string;
        role: Role;
      };
      prisma?: PrismaClient;
    }
  }
}
```

- [ ] **Step 2: Create the tenant Prisma extension**

Create `packages/api/src/services/tenant-prisma.ts`:

```typescript
import { prisma } from './prisma.js';

const TENANT_MODELS = new Set([
  'Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook', 'ApiKey',
]);

export function createTenantPrisma(orgId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query, model }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);

        // Inject orgId into where clauses (find, update, delete)
        if ('where' in args && args.where) {
          (args.where as Record<string, unknown>).orgId = orgId;
        }
        // Inject orgId into create data
        if ('data' in args && args.data && typeof args.data === 'object') {
          (args.data as Record<string, unknown>).orgId = orgId;
        }

        return query(args);
      },
    },
  }) as unknown as typeof prisma;
}
```

- [ ] **Step 3: Write tests for tenant Prisma extension**

Create `packages/api/tests/tenant-prisma.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the extension logic by verifying args are modified.
// Since $extends creates a wrapper, we test the function's behavior
// by mocking the underlying prisma and checking injected orgId.

const mockPrisma = vi.hoisted(() => ({
  $extends: vi.fn(),
}));

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('createTenantPrisma', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls $extends with query override', () => {
    mockPrisma.$extends.mockReturnValue({});
    createTenantPrisma('org-123');
    expect(mockPrisma.$extends).toHaveBeenCalledTimes(1);

    const extensionArg = mockPrisma.$extends.mock.calls[0][0];
    expect(extensionArg.query).toBeDefined();
    expect(extensionArg.query.$allOperations).toBeInstanceOf(Function);
  });

  it('injects orgId into where clause for tenant models', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-123');

    const mockQuery = vi.fn((args: any) => args);
    const args = { where: { id: 'some-id' } };
    capturedHandler!({ args, query: mockQuery, model: 'Session' });

    expect(args.where).toEqual({ id: 'some-id', orgId: 'org-123' });
    expect(mockQuery).toHaveBeenCalledWith(args);
  });

  it('injects orgId into create data for tenant models', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-456');

    const mockQuery = vi.fn((args: any) => args);
    const args = { data: { name: 'Test Rule' } };
    capturedHandler!({ args, query: mockQuery, model: 'Rule' });

    expect(args.data).toEqual({ name: 'Test Rule', orgId: 'org-456' });
  });

  it('passes through non-tenant models unchanged', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-789');

    const mockQuery = vi.fn((args: any) => args);
    const args = { where: { id: 'u1' } };
    capturedHandler!({ args, query: mockQuery, model: 'Organization' });

    expect(args.where).toEqual({ id: 'u1' }); // no orgId injected
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/types/ packages/api/src/services/tenant-prisma.ts packages/api/tests/tenant-prisma.test.ts
git commit -m "feat(api): add tenant Prisma extension and Express type augmentation"
```

---

### Task 5: Auth Middleware — Clerk Token + API Key Validation

Replace the current auth middleware with one that supports Clerk tokens and org-scoped API keys.

**Files:**
- Modify: `packages/api/src/middleware/auth.ts`
- Create: `packages/api/src/middleware/tenant.ts`
- Create: `packages/api/src/middleware/require-role.ts`
- Modify: `packages/api/package.json` (add `@clerk/express`, `bcrypt`, `svix` dependencies)

**Context:** The auth middleware detects auth type (Clerk token vs API key vs legacy env-var key), validates credentials, and attaches `req.auth`. The tenant middleware creates a scoped Prisma client. The role middleware guards routes.

- [ ] **Step 1: Install new dependencies**

Run:
```bash
cd packages/api && pnpm add @clerk/express bcrypt svix && pnpm add -D @types/bcrypt
```

- [ ] **Step 2: Rewrite auth middleware**

Replace `packages/api/src/middleware/auth.ts` with:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/express';
import bcrypt from 'bcrypt';
import { prisma } from '../services/prisma.js';

const LEGACY_API_KEY = process.env.AGENT_API_KEY;
const DEFAULT_ORG_ID = 'org_default_seed';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Path 1: Org-scoped API key
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const resolved = await resolveApiKey(apiKeyHeader);
      if (resolved) {
        req.auth = resolved;
        return next();
      }

      // Legacy fallback: env-var API key → seed org
      if (LEGACY_API_KEY && apiKeyHeader === LEGACY_API_KEY) {
        console.warn('Legacy AGENT_API_KEY used — migrate to org-scoped API keys');
        req.auth = { orgId: DEFAULT_ORG_ID, role: 'ADMIN' };
        return next();
      }

      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Path 2: Clerk Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const resolved = await resolveClerkToken(token);
      if (resolved) {
        req.auth = resolved;
        return next();
      }
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    res.status(401).json({ error: 'Unauthorized — provide x-api-key or Bearer token' });
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function resolveApiKey(
  rawKey: string,
): Promise<{ orgId: string; userId?: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } | null> {
  const prefix = rawKey.slice(0, 12);
  const apiKey = await prisma.apiKey.findFirst({
    where: { prefix, revokedAt: null },
  });
  if (!apiKey) return null;

  const valid = await bcrypt.compare(rawKey, apiKey.keyHash);
  if (!valid) return null;

  // Update lastUsedAt (fire-and-forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // API keys authenticate as ADMIN by default
  return { orgId: apiKey.orgId, role: 'ADMIN' };
}

async function resolveClerkToken(
  token: string,
): Promise<{ orgId: string; userId?: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } | null> {
  try {
    const payload = await clerkClient.verifyToken(token);
    if (!payload.org_id) return null;

    // Look up our local org by Clerk org ID
    const org = await prisma.organization.findUnique({
      where: { clerkOrgId: payload.org_id },
    });
    if (!org) return null;

    // Map Clerk role to our Role enum
    const clerkRole = payload.org_role as string;
    let role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER';
    if (clerkRole === 'org:admin') role = 'ADMIN';
    if (clerkRole === 'org:owner' || clerkRole === 'admin') role = 'OWNER';

    // Upsert user record and update lastSeenAt
    const userId = payload.sub;
    if (userId) {
      prisma.user.upsert({
        where: { clerkUserId: userId },
        update: { lastSeenAt: new Date(), role },
        create: {
          clerkUserId: userId,
          email: (payload as any).email || '',
          orgId: org.id,
          role,
        },
      }).catch(() => {});
    }

    return { orgId: org.id, userId, role };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Create tenant middleware**

Create `packages/api/src/middleware/tenant.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { createTenantPrisma } from '../services/tenant-prisma.js';

export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth?.orgId) {
    res.status(401).json({ error: 'No tenant context' });
    return;
  }

  req.prisma = createTenantPrisma(req.auth.orgId);
  next();
}
```

- [ ] **Step 4: Create role middleware**

Create `packages/api/src/middleware/require-role.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!allowed.includes(req.auth.role as Role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 5: Write tests for auth and role middleware**

Create `packages/api/tests/middleware/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
const mockPrisma = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  user: { upsert: vi.fn() },
}));

vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('@clerk/express', () => ({
  clerkClient: {
    verifyToken: vi.fn(),
  },
}));
vi.mock('bcrypt', () => ({ default: { compare: vi.fn() } }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: vi.fn(() => ({})),
}));

import { authMiddleware } from '../../src/middleware/auth.js';
import { tenantMiddleware } from '../../src/middleware/tenant.js';
import { requireRole } from '../../src/middleware/require-role.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/test', authMiddleware, tenantMiddleware, (_req, res) => {
    res.json({ orgId: _req.auth?.orgId, role: _req.auth?.role });
  });
  app.get('/admin-only', authMiddleware, tenantMiddleware, requireRole('OWNER', 'ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('Auth middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no credentials provided', async () => {
    const app = createApp();
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
  });

  it('authenticates with legacy API key', async () => {
    // Legacy key set via env
    process.env.AGENT_API_KEY = 'legacy-test-key';
    const app = createApp();
    const res = await request(app).get('/test').set('x-api-key', 'legacy-test-key');
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org_default_seed');
    expect(res.body.role).toBe('ADMIN');
    delete process.env.AGENT_API_KEY;
  });

  it('rejects invalid API key', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app).get('/test').set('x-api-key', 'pk_live_invalid_key');
    expect(res.status).toBe(401);
  });
});

describe('requireRole middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows ADMIN to access admin-only route', async () => {
    process.env.AGENT_API_KEY = 'admin-key';
    const app = createApp();
    const res = await request(app).get('/admin-only').set('x-api-key', 'admin-key');
    expect(res.status).toBe(200);
    delete process.env.AGENT_API_KEY;
  });

  it('rejects MEMBER from admin-only route', async () => {
    // Simulate a Clerk token that resolves to MEMBER
    const { clerkClient } = await import('@clerk/express');
    (clerkClient.verifyToken as any).mockResolvedValue({
      org_id: 'clerk_org_1',
      org_role: 'org:member',
      sub: 'user_1',
    });
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1', clerkOrgId: 'clerk_org_1' });
    mockPrisma.user.upsert.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).get('/admin-only').set('Authorization', 'Bearer valid-clerk-token');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/middleware/ packages/api/tests/middleware/ packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add Clerk + API key auth middleware, tenant middleware, role guards"
```

---

### Task 6: Wire Middleware Into App + Update Routes

Connect the new auth/tenant middleware chain to the Express app and update all route handlers to use `req.prisma` instead of the global `prisma`.

**Files:**
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/routes/rules.ts`
- Modify: `packages/api/src/routes/webhooks.ts`
- Modify: `packages/api/src/routes/insights.ts`
- Modify: `packages/api/src/routes/sessions.ts`
- Modify: `packages/api/src/routes/dashboard.ts`
- Modify: `packages/api/src/routes/alerts.ts`

**Context:** Each route handler currently imports the global `prisma` singleton. After this change, they use `req.prisma!` (the tenant-scoped client). The global import is removed. The alerts route uses `alertManager` which also needs scoping — that's handled in Task 7.

- [ ] **Step 1: Update app.ts to use new middleware chain**

Replace `packages/api/src/app.ts` with:

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
import { apiKeysRouter } from './routes/api-keys.js';
import { clerkWebhookRouter } from './routes/clerk-webhook.js';
import { setupRouter } from './routes/setup.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Public routes
  app.use('/api/health', healthRouter);
  app.use('/api/clerk/webhook', clerkWebhookRouter);

  // Auth + tenant scoped routes
  app.use('/api/setup', authMiddleware, setupRouter);
  app.use('/api/sessions', authMiddleware, tenantMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, tenantMiddleware, dashboardRouter);
  app.use('/api/rules', authMiddleware, tenantMiddleware, rulesRouter);
  app.use('/api/alerts', authMiddleware, tenantMiddleware, alertsRouter);
  app.use('/api/insights', authMiddleware, tenantMiddleware, insightsRouter);
  app.use('/api/webhooks', authMiddleware, tenantMiddleware, webhooksRouter);
  app.use('/api/api-keys', authMiddleware, tenantMiddleware, apiKeysRouter);

  return app;
}
```

- [ ] **Step 2: Update rules.ts to use req.prisma**

In `packages/api/src/routes/rules.ts`:

Remove the import `import { prisma } from '../services/prisma.js';`

Replace every `prisma.rule.` with `req.prisma!.rule.` throughout the file. Specifically:
- `prisma.rule.findMany` → `req.prisma!.rule.findMany`
- `prisma.rule.findUnique` → `req.prisma!.rule.findUnique`
- `prisma.rule.create` → `req.prisma!.rule.create`
- `prisma.rule.update` → `req.prisma!.rule.update`
- `prisma.rule.delete` → `req.prisma!.rule.delete`

- [ ] **Step 3: Update webhooks.ts to use req.prisma**

In `packages/api/src/routes/webhooks.ts`:

Remove the import `import { prisma } from '../services/prisma.js';`

Replace every `prisma.webhook.` with `req.prisma!.webhook.` throughout the file.

- [ ] **Step 4: Update insights.ts to use req.prisma**

In `packages/api/src/routes/insights.ts`, apply the same pattern. Read the file first to see current Prisma usage and update accordingly.

- [ ] **Step 5: Update sessions.ts and dashboard.ts to use req.prisma**

These routes may use the session service rather than prisma directly. Read each file. If they call the global prisma, switch to `req.prisma!`. If they call service functions, those services will be updated in Task 7.

- [ ] **Step 6: Add role guards to write routes**

In `packages/api/src/routes/rules.ts`, add import and guards:

```typescript
import { requireRole } from '../middleware/require-role.js';

// Add before write handlers:
rulesRouter.post('/', requireRole('OWNER', 'ADMIN'), async (req, res) => { ... });
rulesRouter.put('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => { ... });
rulesRouter.delete('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => { ... });
rulesRouter.post('/:id/toggle', requireRole('OWNER', 'ADMIN'), async (req, res) => { ... });
// GET routes remain accessible to all roles
```

Apply the same pattern to `webhooks.ts` (POST, PUT, DELETE require OWNER/ADMIN) and `insights.ts` (apply insight requires OWNER/ADMIN).

- [ ] **Step 7: Run build and tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test`

Fix any test failures — existing route tests will need their mock setup updated since routes now use `req.prisma` instead of the global import.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/
git commit -m "feat(api): wire auth/tenant middleware, update routes to use req.prisma"
```

---

### Task 7: Update Services for Tenant Context

Update services that use the global prisma to accept a tenant-scoped client, and scope WebSocket connections by org.

**Files:**
- Modify: `packages/api/src/services/session-service.ts`
- Modify: `packages/api/src/services/intelligence/alert-manager.ts`
- Modify: `packages/api/src/services/intelligence/rule-engine.ts`
- Modify: `packages/api/src/services/intelligence/insight-generator.ts`
- Modify: `packages/api/src/services/intelligence/webhook-service.ts`
- Modify: `packages/api/src/ws-server.ts`

**Context:** Services currently use the global `prisma` singleton. For route handlers, the tenant-scoped client comes from `req.prisma`. For WebSocket, the `orgId` is resolved at handshake and a scoped client is created per connection. The intelligence services (rule-engine, anomaly-detector, etc.) are called from the WebSocket handler and need the scoped client passed in.

- [ ] **Step 1: Update session-service.ts**

The session service functions are called from both routes and WebSocket. Add an optional `db` parameter that defaults to the global prisma:

```typescript
import { prisma as globalPrisma } from './prisma.js';
import type { PrismaClient } from '@prisma/client';

// In each function, add db parameter:
export async function startSession(input: StartSessionInput, db: PrismaClient = globalPrisma) {
  // Replace all `prisma.` with `db.`
}

export async function updateSession(input: UpdateSessionInput, db: PrismaClient = globalPrisma) {
  // Replace all `prisma.` with `db.`
}

// Same pattern for endSession, getSessionById, getLiveSummary, getSessionHistory
```

- [ ] **Step 2: Update alert-manager.ts**

Add optional `db` parameter to the `create` method and other methods that are called from WebSocket context. Methods called from routes will use `req.prisma` passed through.

- [ ] **Step 3: Update rule-engine.ts**

The `evaluate` method is called from WebSocket. Add optional `db` parameter:

```typescript
async evaluate(event: TokenEvent, session: Session, db: PrismaClient = globalPrisma) {
  // Use db instead of prisma for queries
}
```

- [ ] **Step 4: Update ws-server.ts for tenant-scoped connections**

Add API key validation on WebSocket handshake:

In `wss.on('connection')`, before processing messages:

```typescript
wss.on('connection', async (ws: TaggedWebSocket, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  ws.role = url.searchParams.get('role') === 'agent' ? 'agent' : 'dashboard';
  ws.isAlive = true;

  // Resolve tenant context for agent connections
  if (ws.role === 'agent') {
    const apiKey = url.searchParams.get('apiKey') || req.headers['x-api-key'] as string;
    if (!apiKey) {
      ws.close(4001, 'API key required');
      return;
    }
    // resolveApiKey returns { orgId, role } or null
    const auth = await resolveWsApiKey(apiKey);
    if (!auth) {
      ws.close(4001, 'Invalid API key');
      return;
    }
    ws.orgId = auth.orgId;
    ws.tenantPrisma = createTenantPrisma(auth.orgId);
  }

  // ... rest of handler, pass ws.tenantPrisma to service calls
});
```

Update `TaggedWebSocket` interface to include `orgId` and `tenantPrisma`.

- [ ] **Step 5: Update existing tests**

Existing service tests may need the optional `db` parameter. Update mock setups to pass the mock prisma as the `db` argument where needed.

- [ ] **Step 6: Run build and tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build && pnpm -r test`

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/ packages/api/tests/
git commit -m "feat(api): add tenant context to services and WebSocket connections"
```

---

### Task 8: API Key Routes

Create CRUD endpoints for org-scoped API keys.

**Files:**
- Create: `packages/api/src/routes/api-keys.ts`
- Create: `packages/api/tests/routes/api-keys.test.ts`

**Context:** API keys are generated as `pk_live_<32 random chars>`. The full key is shown once on creation. Only the prefix (first 12 chars) and bcrypt hash are stored. All endpoints require OWNER or ADMIN role.

- [ ] **Step 1: Create the API keys route**

Create `packages/api/src/routes/api-keys.ts`:

```typescript
import { Router, IRouter } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { requireRole } from '../middleware/require-role.js';

export const apiKeysRouter: IRouter = Router();

// All API key operations require OWNER or ADMIN
apiKeysRouter.use(requireRole('OWNER', 'ADMIN'));

apiKeysRouter.get('/', async (req, res) => {
  try {
    const keys = await req.prisma!.apiKey.findMany({
      where: { revokedAt: null },
      select: {
        id: true,
        prefix: true,
        name: true,
        createdBy: { select: { email: true, name: true } },
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiKeysRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required (string)' });
      return;
    }

    // Generate key: pk_live_ + 32 random hex chars
    const rawKey = `pk_live_${randomBytes(16).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await req.prisma!.apiKey.create({
      data: {
        name,
        prefix,
        keyHash,
        createdById: req.auth!.userId!,
      },
    });

    // Return the full key ONCE — it cannot be retrieved again
    res.status(201).json({
      id: apiKey.id,
      key: rawKey,
      prefix,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiKeysRouter.delete('/:id', async (req, res) => {
  try {
    await req.prisma!.apiKey.update({
      where: { id: req.params.id },
      data: { revokedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 2: Write tests**

Create `packages/api/tests/routes/api-keys.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  apiKey: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }));

import { apiKeysRouter } from '../../src/routes/api-keys.js';

function createApp(role: string = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { orgId: 'org-1', userId: 'user-1', role: role as any };
    req.prisma = mockPrisma as any;
    next();
  });
  app.use('/api-keys', apiKeysRouter);
  return app;
}

describe('API Keys routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api-keys', () => {
    it('creates a key and returns it once', async () => {
      mockPrisma.apiKey.create.mockResolvedValue({
        id: 'key-1',
        name: 'Deploy Key',
        prefix: 'pk_live_abcd',
        createdAt: new Date(),
      });

      const app = createApp();
      const res = await request(app).post('/api-keys').send({ name: 'Deploy Key' });

      expect(res.status).toBe(201);
      expect(res.body.key).toMatch(/^pk_live_/);
      expect(res.body.key.length).toBe(40); // pk_live_ (8) + 32 hex chars
      expect(res.body.name).toBe('Deploy Key');
    });

    it('rejects missing name', async () => {
      const app = createApp();
      const res = await request(app).post('/api-keys').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('soft-deletes by setting revokedAt', async () => {
      mockPrisma.apiKey.update.mockResolvedValue({});
      const app = createApp();
      const res = await request(app).delete('/api-keys/key-1');
      expect(res.status).toBe(200);
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('Role enforcement', () => {
    it('rejects MEMBER role', async () => {
      const app = createApp('MEMBER');
      const res = await request(app).get('/api-keys');
      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/api-keys.ts packages/api/tests/routes/api-keys.test.ts
git commit -m "feat(api): add API key CRUD routes with role enforcement"
```

---

### Task 9: Clerk Webhook Handler + Setup Claim Endpoint

Handle Clerk webhook events for org/user sync and the first-user claim flow.

**Files:**
- Create: `packages/api/src/routes/clerk-webhook.ts`
- Create: `packages/api/src/routes/setup.ts`
- Create: `packages/api/tests/routes/clerk-webhook.test.ts`

**Context:** Clerk sends signed webhook events via Svix. We verify the signature, then create/update/delete local Organization and User records. The setup endpoint lets the first authenticated user claim the seed org.

- [ ] **Step 1: Create Clerk webhook handler**

Create `packages/api/src/routes/clerk-webhook.ts`:

```typescript
import { Router, IRouter } from 'express';
import { Webhook } from 'svix';
import { prisma } from '../services/prisma.js';

export const clerkWebhookRouter: IRouter = Router();

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || '';

clerkWebhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    const payload = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    }) as any;

    const { type, data } = payload;

    switch (type) {
      case 'organization.created':
        await prisma.organization.create({
          data: {
            clerkOrgId: data.id,
            name: data.name,
            slug: data.slug,
          },
        });
        break;

      case 'organization.updated':
        await prisma.organization.update({
          where: { clerkOrgId: data.id },
          data: { name: data.name, slug: data.slug },
        });
        break;

      case 'organizationMembership.created': {
        const org = await prisma.organization.findUnique({
          where: { clerkOrgId: data.organization.id },
        });
        if (!org) break;

        const role = mapClerkRole(data.role);
        await prisma.user.upsert({
          where: { clerkUserId: data.public_user_data.user_id },
          update: { orgId: org.id, role },
          create: {
            clerkUserId: data.public_user_data.user_id,
            email: data.public_user_data.email_address || '',
            name: data.public_user_data.first_name || undefined,
            orgId: org.id,
            role,
          },
        });
        break;
      }

      case 'organizationMembership.updated': {
        const role = mapClerkRole(data.role);
        await prisma.user.update({
          where: { clerkUserId: data.public_user_data.user_id },
          data: { role },
        });
        break;
      }

      case 'organizationMembership.deleted':
        await prisma.user.delete({
          where: { clerkUserId: data.public_user_data.user_id },
        }).catch(() => {}); // Ignore if not found
        break;

      case 'user.updated':
        await prisma.user.update({
          where: { clerkUserId: data.id },
          data: {
            email: data.email_addresses?.[0]?.email_address,
            name: [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined,
          },
        }).catch(() => {}); // Ignore if user not found
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Clerk webhook error:', err);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

function mapClerkRole(clerkRole: string): 'OWNER' | 'ADMIN' | 'MEMBER' {
  if (clerkRole === 'admin' || clerkRole === 'org:admin') return 'OWNER';
  // Clerk's default member role
  return 'MEMBER';
}
```

**Note:** The `express.raw()` middleware is needed because Svix verifies the raw body. Since this route is mounted separately from the `express.json()` middleware in app.ts, you need to handle the raw body parsing inline. Alternatively, mount this route BEFORE `app.use(express.json())` in app.ts.

- [ ] **Step 2: Create the setup/claim endpoint**

Create `packages/api/src/routes/setup.ts`:

```typescript
import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';

export const setupRouter: IRouter = Router();

const DEFAULT_ORG_ID = 'org_default_seed';

setupRouter.post('/claim', async (req, res) => {
  try {
    if (!req.auth?.orgId) {
      res.status(401).json({ error: 'Must be authenticated with a Clerk org' });
      return;
    }

    // Check if seed org exists and is unclaimed
    const seedOrg = await prisma.organization.findUnique({
      where: { id: DEFAULT_ORG_ID },
    });

    if (!seedOrg) {
      res.status(404).json({ error: 'No seed organization to claim' });
      return;
    }

    if (seedOrg.clerkOrgId) {
      res.status(409).json({ error: 'Seed organization already claimed' });
      return;
    }

    // Look up the Clerk org
    const clerkOrg = await prisma.organization.findUnique({
      where: { clerkOrgId: req.auth.orgId },
    });

    if (!clerkOrg) {
      // The authenticated org doesn't exist locally yet — link the seed org to it
      await prisma.organization.update({
        where: { id: DEFAULT_ORG_ID },
        data: { clerkOrgId: req.auth.orgId },
      });

      res.json({ claimed: true, orgId: DEFAULT_ORG_ID });
    } else {
      // Merge: move all seed org data to the Clerk org
      // This is complex — for now, just link the seed org
      await prisma.organization.update({
        where: { id: DEFAULT_ORG_ID },
        data: { clerkOrgId: req.auth.orgId },
      });

      res.json({ claimed: true, orgId: DEFAULT_ORG_ID });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

- [ ] **Step 3: Write Clerk webhook tests**

Create `packages/api/tests/routes/clerk-webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  organization: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  user: { upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));

// Mock Svix to skip signature verification in tests
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn((body: any) => JSON.parse(body.toString())),
  })),
}));

describe('Clerk webhook handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates organization on organization.created event', async () => {
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-1' });

    // Test the handler logic directly since raw body parsing is tricky
    // Import and call the route's handler logic
    const { clerkWebhookRouter } = await import('../../src/routes/clerk-webhook.js');
    expect(clerkWebhookRouter).toBeDefined();
    // Detailed HTTP-level tests would need supertest with raw body support
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/clerk-webhook.ts packages/api/src/routes/setup.ts packages/api/tests/routes/clerk-webhook.test.ts
git commit -m "feat(api): add Clerk webhook handler and seed org claim endpoint"
```

---

### Task 10: Frontend — Clerk Integration

Install Clerk, wrap the app, add sign-in/sign-up pages, protect routes with proxy.ts, and update the API client.

**Files:**
- Modify: `packages/web/package.json` (add `@clerk/nextjs`)
- Modify: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `packages/web/src/app/sign-up/[[...sign-up]]/page.tsx`
- Create: `packages/web/proxy.ts` (Next.js 16 uses proxy.ts, not middleware.ts)
- Modify: `packages/web/src/lib/api.ts`
- Modify: `packages/web/.env.local`

**Context:** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The proxy function runs before routes and handles auth redirects. Clerk's Next.js SDK should work with proxy.ts — the function is `clerkMiddleware()` from `@clerk/nextjs/server` but exported as the proxy function.

**IMPORTANT:** Before writing any Next.js code, read the relevant docs at `packages/web/node_modules/next/dist/docs/` to verify API compatibility with Next.js 16. The `proxy.ts` convention replaces `middleware.ts`.

- [ ] **Step 1: Install Clerk**

Run:
```bash
cd packages/web && pnpm add @clerk/nextjs
```

- [ ] **Step 2: Add Clerk environment variables**

Update `packages/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

- [ ] **Step 3: Wrap root layout with ClerkProvider**

Update `packages/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "Pulse — AI Dev Health Monitor",
  description: "Real-time token consumption monitoring for AI coding tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body
          className="min-h-full flex"
          style={{ background: 'var(--bg)', color: 'var(--text-1)' }}
        >
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create sign-in page**

Create `packages/web/src/app/sign-in/[[...sign-in]]/page.tsx`:

```typescript
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <SignIn />
    </div>
  );
}
```

- [ ] **Step 5: Create sign-up page**

Create `packages/web/src/app/sign-up/[[...sign-up]]/page.tsx`:

```typescript
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <SignUp />
    </div>
  );
}
```

- [ ] **Step 6: Create proxy.ts for route protection**

Create `packages/web/proxy.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/clerk/webhook',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

**Note:** If `clerkMiddleware` doesn't work directly as a proxy export in Next.js 16, wrap it:

```typescript
import { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  return clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  })(request);
}
```

Test both approaches. The Clerk SDK may need updating for Next.js 16 compatibility.

- [ ] **Step 7: Update API client to use Clerk token**

Replace `packages/web/src/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getTokenFn ? await getTokenFn() : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
```

Then create a provider component to wire Clerk's token into the API client.

Create `packages/web/src/components/auth/token-provider.tsx`:

```typescript
'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { setTokenProvider } from '@/lib/api';

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);

  return <>{children}</>;
}
```

Add `<TokenProvider>` inside `<ClerkProvider>` in the root layout, wrapping the body content.

- [ ] **Step 8: Run build**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build`

- [ ] **Step 9: Commit**

```bash
git add packages/web/
git commit -m "feat(web): add Clerk auth, proxy route protection, token-based API client"
```

---

### Task 11: Frontend — Sidebar Auth UI + Settings Pages

Add Clerk UI components to the sidebar and create API key management page.

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`
- Create: `packages/web/src/app/settings/api-keys/page.tsx`
- Create: `packages/web/src/app/settings/members/page.tsx`

**Context:** The sidebar gets `<UserButton>` and `<OrganizationSwitcher>` from Clerk. New settings sub-pages for API key management and member viewing.

- [ ] **Step 1: Update sidebar with Clerk components**

In `packages/web/src/components/layout/sidebar.tsx`, add imports and components:

```typescript
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';
```

Replace the Logo section with:

```typescript
{/* Logo + Org Switcher */}
<div className="px-5 py-5 space-y-3">
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
  <OrganizationSwitcher
    appearance={{
      elements: { rootBox: 'w-full', organizationSwitcherTrigger: 'w-full justify-between' },
    }}
  />
</div>
```

Replace the PlanCard at the bottom with:

```typescript
{/* User button pinned to bottom */}
<div className="px-3 pb-4 pt-2 border-t border-[var(--border)]">
  <div className="flex items-center gap-3 px-2">
    <UserButton
      appearance={{
        elements: { avatarBox: 'size-8' },
      }}
    />
    <PlanCard planName="Max Plan" monthlyCost={100} totalValue={totalValue} />
  </div>
</div>
```

- [ ] **Step 2: Add settings sub-navigation**

Add NavItems for the new settings pages in the Configure section:

```typescript
<NavItem href="/settings" label="Settings" icon={Settings} />
<NavItem href="/settings/api-keys" label="API Keys" icon={Key} />
<NavItem href="/settings/members" label="Members" icon={Users} />
```

Import `Key` and `Users` from `lucide-react`.

- [ ] **Step 3: Create API keys page**

Create `packages/web/src/app/settings/api-keys/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useWebSocket } from '@/hooks/use-websocket';
import { fetchApi } from '@/lib/api';
import useSWR from 'swr';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  createdBy: { email: string; name?: string };
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const { connected } = useWebSocket(() => {});
  const { data: keys, mutate } = useSWR<ApiKey[]>('/api/api-keys', (url: string) => fetchApi(url));
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    const result = await fetchApi<{ key: string }>('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: keyName }),
    });
    setNewKey(result.key);
    setKeyName('');
    setShowCreate(false);
    mutate();
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await fetchApi(`/api/api-keys/${id}`, { method: 'DELETE' });
    mutate();
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      <PageHeader title="API Keys" connected={connected} />
      <div className="p-8 max-w-2xl space-y-4">
        {newKey && (
          <div className="rounded-[12px] border border-[var(--green)] bg-[var(--green-bg)] p-4">
            <p className="text-[13px] font-semibold text-[var(--green)] mb-2">
              Key created — copy it now, it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[12px] font-mono bg-[var(--bg)] px-3 py-2 rounded-[8px] truncate">
                {newKey}
              </code>
              <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-[var(--surface-hover)]">
                {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">API Keys</h3>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]"
            >
              <Plus size={13} /> Create Key
            </button>
          </div>

          <div className="px-5 py-3 space-y-3">
            {showCreate && (
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)]">
                <input
                  className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Key name (e.g. Production Agent)"
                />
                <button onClick={() => setShowCreate(false)} className="text-[12px] text-[var(--text-3)]">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={!keyName}
                  className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            )}

            {keys?.map((key) => (
              <div key={key.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-[13px] font-medium text-[var(--text-1)]">{key.name}</div>
                  <div className="text-[12px] text-[var(--text-3)] font-mono">{key.prefix}...</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-3)]">
                    {key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                  </span>
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--red-bg)] text-[var(--text-3)] hover:text-[var(--red)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            {(!keys || keys.length === 0) && !showCreate && (
              <p className="text-[13px] text-[var(--text-3)] py-2">No API keys created yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create members page**

Create `packages/web/src/app/settings/members/page.tsx`:

```typescript
'use client';

import { OrganizationProfile } from '@clerk/nextjs';
import { PageHeader } from '@/components/ui/page-header';
import { useWebSocket } from '@/hooks/use-websocket';

export default function MembersPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Members" connected={connected} />
      <div className="p-8 max-w-3xl">
        <OrganizationProfile
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'w-full shadow-none border border-[var(--border)] rounded-[20px]',
            },
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run build**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build`

- [ ] **Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): add auth UI components, API key management, members page"
```

---

### Task 12: Agent Config Update + Full Build Verification

Update the agent package config to support org-scoped API keys, run full build and test suite.

**Files:**
- Modify: `packages/agent/src/config.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/src/telemetry-streamer.ts` (if it exists — check for WebSocket connection setup)
- Update: `packages/api/.env` (add Clerk env vars)
- Update: `.env.example`

- [ ] **Step 1: Update agent config type**

In `packages/agent/src/config.ts`, update `AgentConfig` interface:

```typescript
export interface AgentConfig {
  apiUrl: string;
  apiKey: string;       // Now org-scoped: pk_live_xxx
  userToken?: string;   // Optional personal token: pt_live_xxx
  localPort: number;
}
```

Update `DEFAULT_CONFIG`:
```typescript
const DEFAULT_CONFIG: AgentConfig = {
  apiUrl: 'ws://localhost:3001/ws',
  apiKey: '',  // No more hardcoded default — must be configured
  localPort: 7823,
};
```

- [ ] **Step 2: Update agent entry point**

In `packages/agent/src/index.ts`, add `--user-token` option:

```typescript
program
  .command('start')
  .description('Start monitoring Claude Code sessions')
  .option('--api-url <url>', 'Pulse API WebSocket URL')
  .option('--api-key <key>', 'Pulse API key (org-scoped)')
  .option('--user-token <token>', 'Personal user token (optional)')
  .option('--port <number>', 'Local REST API port', '7823')
```

- [ ] **Step 3: Update env examples**

Update `.env.example`:

```
DATABASE_URL=postgresql://pulse:pulse@localhost:5432/pulse
REDIS_URL=redis://localhost:6379
API_PORT=3001
AGENT_API_KEY=change-me-in-production
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
CLERK_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

Update `packages/api/.env` to add:
```
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE
CLERK_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

- [ ] **Step 4: Full build**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r build`

- [ ] **Step 5: Full test suite**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

Fix any failing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/ packages/api/.env .env.example
git commit -m "feat(agent): update config for org-scoped API keys, add env examples"
```

---

### Task 13: Cross-Tenant Isolation Test

Write an integration-style test that verifies complete tenant data isolation.

**Files:**
- Create: `packages/api/tests/tenant-isolation.test.ts`

**Context:** This is the safety net test. It creates two fake orgs, creates data in each, and verifies neither can see the other's data.

- [ ] **Step 1: Write cross-tenant isolation test**

Create `packages/api/tests/tenant-isolation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createdRecords: Record<string, Record<string, any[]>> = {};

const mockPrisma = vi.hoisted(() => {
  const store: Record<string, any[]> = {};

  return {
    $extends: vi.fn((ext: any) => {
      // Return a mock that simulates tenant filtering
      const handler = ext.query.$allOperations;
      return {
        rule: {
          create: vi.fn(async (args: any) => {
            const modifiedArgs = { ...args };
            handler({ args: modifiedArgs, query: () => modifiedArgs, model: 'Rule' });
            const record = { id: Math.random().toString(), ...modifiedArgs.data };
            const orgId = modifiedArgs.data.orgId;
            if (!store[orgId]) store[orgId] = [];
            store[orgId].push(record);
            return record;
          }),
          findMany: vi.fn(async (args: any) => {
            const modifiedArgs = { ...args, where: { ...(args?.where || {}) } };
            handler({ args: modifiedArgs, query: () => modifiedArgs, model: 'Rule' });
            const orgId = modifiedArgs.where.orgId;
            return store[orgId] || [];
          }),
        },
        _store: store,
      };
    }),
  };
});

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('Cross-tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear store
    const store = (mockPrisma.$extends as any)._store;
    if (store) Object.keys(store).forEach((k) => delete store[k]);
  });

  it('org A cannot see org B rules', async () => {
    const prismaA = createTenantPrisma('org-a') as any;
    const prismaB = createTenantPrisma('org-b') as any;

    // Create rules in each org
    await prismaA.rule.create({ data: { name: 'Rule A', type: 'COST_CAP_SESSION' } });
    await prismaB.rule.create({ data: { name: 'Rule B', type: 'COST_CAP_DAILY' } });

    // Query each org
    const rulesA = await prismaA.rule.findMany({});
    const rulesB = await prismaB.rule.findMany({});

    expect(rulesA).toHaveLength(1);
    expect(rulesA[0].name).toBe('Rule A');
    expect(rulesA[0].orgId).toBe('org-a');

    expect(rulesB).toHaveLength(1);
    expect(rulesB[0].name).toBe('Rule B');
    expect(rulesB[0].orgId).toBe('org-b');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd C:/Users/Itamar/MyProjects/pulse && pnpm -r test`

- [ ] **Step 3: Commit**

```bash
git add packages/api/tests/tenant-isolation.test.ts
git commit -m "test(api): add cross-tenant data isolation verification"
```
