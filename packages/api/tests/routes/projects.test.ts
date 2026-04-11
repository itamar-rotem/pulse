import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

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
    delete: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: () => mockPrisma,
}));

import { projectsRouter } from '../../src/routes/projects.js';

function createApp(role: string = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { orgId: 'org-1', userId: 'user-1', role };
    (req as any).prisma = mockPrisma;
    next();
  });
  app.use('/projects', projectsRouter);
  return app;
}

describe('Projects routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.session.aggregate.mockResolvedValue({ _count: 0, _sum: { costUsd: 0 } });
    mockPrisma.session.count.mockResolvedValue(0);
    mockPrisma.rule.findFirst.mockResolvedValue(null);
    mockPrisma.rule.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('GET /projects', () => {
    it('returns active projects by default', async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'p1', slug: 'app', name: 'App', status: 'ACTIVE' },
      ]);
      mockPrisma.project.count.mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get('/projects');

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
    });

    it('filters by status=archived', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      const app = createApp();
      await request(app).get('/projects?status=archived');

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ARCHIVED' }) }),
      );
    });

    it('status=all returns both active and archived', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      const app = createApp();
      await request(app).get('/projects?status=all');

      const call = mockPrisma.project.findMany.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });

    it('supports search query', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      const app = createApp();
      await request(app).get('/projects?q=my-app');

      const call = mockPrisma.project.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
    });
  });

  describe('GET /projects/:id', () => {
    it('returns project with stats', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        slug: 'app',
        name: 'App',
        status: 'ACTIVE',
      });
      mockPrisma.session.aggregate.mockResolvedValue({ _count: 5, _sum: { costUsd: 12.5 } });
      mockPrisma.session.count.mockResolvedValue(2);

      const app = createApp();
      const res = await request(app).get('/projects/p1');

      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual({
        sessions30d: 5,
        cost30d: 12.5,
        activeSessions: 2,
      });
    });

    it('returns 404 when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/projects/missing');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /projects', () => {
    it('creates a project with valid slug', async () => {
      mockPrisma.project.create.mockResolvedValue({
        id: 'p1',
        slug: 'my-app',
        name: 'My App',
        status: 'ACTIVE',
      });

      const app = createApp();
      const res = await request(app)
        .post('/projects')
        .send({ slug: 'my-app', name: 'My App' });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('my-app');
    });

    it('rejects invalid slug format', async () => {
      const app = createApp();
      const res = await request(app).post('/projects').send({ slug: 'INVALID SLUG!' });

      expect(res.status).toBe(400);
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });

    it('rejects missing slug', async () => {
      const app = createApp();
      const res = await request(app).post('/projects').send({ name: 'Unnamed' });

      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate slug', async () => {
      mockPrisma.project.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`orgId`,`slug`)'),
      );

      const app = createApp();
      const res = await request(app).post('/projects').send({ slug: 'dup' });

      expect(res.status).toBe(409);
    });

    it('materializes budget rule when monthlyBudgetUsd provided', async () => {
      mockPrisma.project.create.mockResolvedValue({
        id: 'p1',
        slug: 'app',
        name: 'App',
        monthlyBudgetUsd: 50,
      });
      mockPrisma.rule.findFirst.mockResolvedValue(null);
      mockPrisma.rule.create.mockResolvedValue({ id: 'r1' });

      const app = createApp();
      const res = await request(app)
        .post('/projects')
        .send({ slug: 'app', name: 'App', monthlyBudgetUsd: 50 });

      expect(res.status).toBe(201);
      expect(mockPrisma.rule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'COST_CAP_PROJECT',
            scope: { projectId: 'p1' },
            condition: { maxCost: 50, period: 'monthly' },
          }),
        }),
      );
    });
  });

  describe('PATCH /projects/:id', () => {
    it('rejects slug in body', async () => {
      const app = createApp();
      const res = await request(app).patch('/projects/p1').send({ slug: 'new-slug' });

      expect(res.status).toBe(400);
    });

    it('updates name and description', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        name: 'Renamed',
        slug: 'app',
      });

      const app = createApp();
      const res = await request(app)
        .patch('/projects/p1')
        .send({ name: 'Renamed', description: 'new desc' });

      expect(res.status).toBe(200);
      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Renamed', description: 'new desc' },
      });
    });

    it('creates budget rule when monthlyBudgetUsd is set', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        name: 'App',
        slug: 'app',
      });
      mockPrisma.rule.findFirst.mockResolvedValue(null);
      mockPrisma.rule.create.mockResolvedValue({ id: 'r1' });

      const app = createApp();
      const res = await request(app)
        .patch('/projects/p1')
        .send({ monthlyBudgetUsd: 100 });

      expect(res.status).toBe(200);
      expect(mockPrisma.rule.create).toHaveBeenCalled();
    });

    it('deletes budget rule when monthlyBudgetUsd is null', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        name: 'App',
        slug: 'app',
      });
      mockPrisma.rule.findFirst.mockResolvedValue({ id: 'r1' });
      mockPrisma.rule.delete.mockResolvedValue({ id: 'r1' });

      const app = createApp();
      const res = await request(app)
        .patch('/projects/p1')
        .send({ monthlyBudgetUsd: null });

      expect(res.status).toBe(200);
      expect(mockPrisma.rule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('archiving sets status and disables budget rule', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        name: 'App',
        slug: 'app',
        status: 'ARCHIVED',
      });

      const app = createApp();
      const res = await request(app)
        .patch('/projects/p1')
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(mockPrisma.rule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { enabled: false },
        }),
      );
    });
  });

  describe('DELETE /projects/:id', () => {
    it('soft-deletes by setting status=ARCHIVED', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        status: 'ARCHIVED',
      });

      const app = createApp();
      const res = await request(app).delete('/projects/p1');

      expect(res.status).toBe(200);
      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'ARCHIVED' }),
      });
      expect(mockPrisma.rule.updateMany).toHaveBeenCalled();
    });
  });

  describe('POST /projects/:id/restore', () => {
    it('sets status back to ACTIVE', async () => {
      mockPrisma.project.update.mockResolvedValue({
        id: 'p1',
        status: 'ACTIVE',
      });

      const app = createApp();
      const res = await request(app).post('/projects/p1/restore');

      expect(res.status).toBe(200);
      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'ACTIVE', archivedAt: null },
      });
    });
  });

  describe('Role enforcement', () => {
    it('MEMBER cannot POST /projects', async () => {
      const app = createApp('MEMBER');
      const res = await request(app).post('/projects').send({ slug: 'app' });

      expect(res.status).toBe(403);
    });

    it('MEMBER cannot PATCH /projects/:id', async () => {
      const app = createApp('MEMBER');
      const res = await request(app).patch('/projects/p1').send({ name: 'X' });

      expect(res.status).toBe(403);
    });

    it('MEMBER cannot DELETE /projects/:id', async () => {
      const app = createApp('MEMBER');
      const res = await request(app).delete('/projects/p1');

      expect(res.status).toBe(403);
    });

    it('MEMBER can GET /projects', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      const app = createApp('MEMBER');
      const res = await request(app).get('/projects');

      expect(res.status).toBe(200);
    });
  });
});
