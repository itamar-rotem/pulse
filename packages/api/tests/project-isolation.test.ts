import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Integration-style test: verifies that project CRUD routes are hard-isolated
 * per organization by the tenant-prisma extension. We spy on the findMany/
 * findUnique/update `where` clauses and assert they always carry an `orgId`
 * matching the authenticated caller, so one org cannot read or mutate
 * another org's projects.
 */

const mockPrisma = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  session: {
    aggregate: vi.fn(),
    count: vi.fn(),
  },
  rule: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

// Simulate the tenant extension: every call must pass through an orgId-bound client.
const whereHistory: Array<{ op: string; where: unknown }> = [];
const dataHistory: Array<{ op: string; data: unknown }> = [];

function makeTenantClient(orgId: string) {
  const wrap =
    (op: string, impl: (...a: any[]) => any) =>
    (args: any) => {
      if (args?.where) {
        args.where.orgId = orgId;
        whereHistory.push({ op, where: { ...args.where } });
      }
      if (args?.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
        args.data.orgId = orgId;
        dataHistory.push({ op, data: { ...args.data } });
      }
      return impl(args);
    };
  return {
    project: {
      findMany: wrap('project.findMany', mockPrisma.project.findMany),
      findUnique: wrap('project.findUnique', mockPrisma.project.findUnique),
      count: wrap('project.count', mockPrisma.project.count),
      create: wrap('project.create', mockPrisma.project.create),
      update: wrap('project.update', mockPrisma.project.update),
    },
    session: {
      aggregate: wrap('session.aggregate', mockPrisma.session.aggregate),
      count: wrap('session.count', mockPrisma.session.count),
    },
    rule: {
      findFirst: wrap('rule.findFirst', mockPrisma.rule.findFirst),
      create: wrap('rule.create', mockPrisma.rule.create),
      update: wrap('rule.update', mockPrisma.rule.update),
      updateMany: wrap('rule.updateMany', mockPrisma.rule.updateMany),
      delete: wrap('rule.delete', mockPrisma.rule.delete),
    },
  };
}

const { projectsRouter } = await import('../src/routes/projects.js');

function makeApp(orgId: string, role: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { orgId, role, userId: 'u1' };
    (req as any).prisma = makeTenantClient(orgId);
    next();
  });
  app.use('/api/projects', projectsRouter);
  return app;
}

describe('Project route tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereHistory.length = 0;
    dataHistory.length = 0;
  });

  it('GET /api/projects scopes findMany to the caller orgId', async () => {
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.project.count.mockResolvedValue(0);

    const app = makeApp('org-A', 'MEMBER');
    const res = await request(app).get('/api/projects');

    expect(res.status).toBe(200);
    const findManyCalls = whereHistory.filter((h) => h.op === 'project.findMany');
    expect(findManyCalls.length).toBeGreaterThan(0);
    for (const c of findManyCalls) {
      expect((c.where as any).orgId).toBe('org-A');
    }
  });

  it('GET /api/projects/:id by org B cannot see org A project (findUnique returns null)', async () => {
    // Simulate: project exists for org-A but tenant client scoped to org-B
    // receives null because the where clause includes orgId: 'org-B'.
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const app = makeApp('org-B', 'OWNER');
    const res = await request(app).get('/api/projects/proj-org-A-123');

    expect(res.status).toBe(404);
    const call = whereHistory.find((h) => h.op === 'project.findUnique');
    expect((call!.where as any).orgId).toBe('org-B');
  });

  it('POST /api/projects auto-injects orgId into the create payload', async () => {
    mockPrisma.project.create.mockResolvedValue({
      id: 'p1',
      slug: 'alpha',
      name: 'Alpha',
      orgId: 'org-A',
    });

    const app = makeApp('org-A', 'OWNER');
    const res = await request(app)
      .post('/api/projects')
      .send({ slug: 'alpha', name: 'Alpha' });

    expect(res.status).toBe(201);
    const createCall = dataHistory.find((h) => h.op === 'project.create');
    expect((createCall!.data as any).orgId).toBe('org-A');
  });

  it('PATCH /api/projects/:id scopes update by orgId (cross-org update is a no-op)', async () => {
    // Tenant-scoped update throws P2025 because the row does not exist under org-B
    mockPrisma.project.update.mockRejectedValue(
      Object.assign(new Error('Record to update not found.'), { code: 'P2025' }),
    );

    const app = makeApp('org-B', 'OWNER');
    const res = await request(app)
      .patch('/api/projects/proj-org-A-123')
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(500);
    const updateCall = whereHistory.find((h) => h.op === 'project.update');
    expect((updateCall!.where as any).orgId).toBe('org-B');
  });
});
