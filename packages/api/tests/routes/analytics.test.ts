import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  session: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: () => mockPrisma,
}));

import { analyticsRouter } from '../../src/routes/analytics.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { orgId: 'org-1', userId: 'user-1', role: 'ADMIN' };
    (req as any).prisma = mockPrisma;
    next();
  });
  app.use('/analytics', analyticsRouter);
  return app;
}

describe('Analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /analytics/cost-trends', () => {
    it('returns daily cost trends with gap filling', async () => {
      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      mockPrisma.session.findMany.mockResolvedValue([
        { startedAt: today, costUsd: 5.0, inputTokens: 1000, outputTokens: 500 },
        { startedAt: today, costUsd: 3.0, inputTokens: 800, outputTokens: 400 },
        { startedAt: yesterday, costUsd: 2.0, inputTokens: 600, outputTokens: 300 },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/cost-trends?granularity=day&days=3');

      expect(res.status).toBe(200);
      expect(res.body.granularity).toBe('day');
      expect(res.body.days).toBe(3);
      // Should have gap-filled entries for each day in the range
      expect(res.body.trends.length).toBeGreaterThanOrEqual(3);

      // Today's bucket should aggregate both sessions
      const todayKey = today.toISOString().slice(0, 10);
      const todayBucket = res.body.trends.find((t: any) => t.date === todayKey);
      expect(todayBucket).toBeDefined();
      expect(todayBucket.cost).toBe(8);
      expect(todayBucket.sessions).toBe(2);
    });

    it('supports monthly granularity', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/cost-trends?granularity=month&days=90');

      expect(res.status).toBe(200);
      expect(res.body.granularity).toBe('month');
    });

    it('defaults to day granularity for invalid values', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/cost-trends?granularity=invalid');

      expect(res.status).toBe(200);
      expect(res.body.granularity).toBe('day');
    });

    it('caps days at 365', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/cost-trends?days=999');

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(365);
    });

    it('filters by projectId when provided', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const app = createApp();
      await request(app).get('/analytics/cost-trends?projectId=p1');

      const call = mockPrisma.session.findMany.mock.calls[0][0];
      expect(call.where.projectId).toBe('p1');
    });
  });

  describe('GET /analytics/breakdown', () => {
    it('returns cost breakdown grouped by project', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        { projectId: 'p1', costUsd: 10, inputTokens: 5000, outputTokens: 2000, project: { name: 'Alpha', slug: 'alpha' } },
        { projectId: 'p1', costUsd: 5, inputTokens: 2000, outputTokens: 1000, project: { name: 'Alpha', slug: 'alpha' } },
        { projectId: 'p2', costUsd: 3, inputTokens: 1000, outputTokens: 500, project: { name: 'Beta', slug: 'beta' } },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/breakdown?groupBy=project');

      expect(res.status).toBe(200);
      expect(res.body.breakdown).toHaveLength(2);
      expect(res.body.breakdown[0].key).toBe('Alpha');
      expect(res.body.breakdown[0].cost).toBe(15);
      expect(res.body.breakdown[0].sessions).toBe(2);
      expect(res.body.breakdown[0].percentage).toBeGreaterThan(0);
    });

    it('groups by model', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        { model: 'claude-sonnet-4-6', costUsd: 5, inputTokens: 1000, outputTokens: 500 },
        { model: 'claude-opus-4', costUsd: 20, inputTokens: 2000, outputTokens: 1000 },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/breakdown?groupBy=model');

      expect(res.status).toBe(200);
      expect(res.body.breakdown).toHaveLength(2);
      // Opus should be first (higher cost)
      expect(res.body.breakdown[0].key).toBe('claude-opus-4');
    });

    it('groups by sessionType', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        { sessionType: 'human', costUsd: 10, inputTokens: 5000, outputTokens: 2000 },
        { sessionType: 'agent', costUsd: 30, inputTokens: 15000, outputTokens: 6000 },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/breakdown?groupBy=sessionType');

      expect(res.status).toBe(200);
      expect(res.body.breakdown).toHaveLength(2);
      expect(res.body.breakdown[0].key).toBe('agent');
      expect(res.body.breakdown[0].percentage).toBe(75);
    });
  });

  describe('GET /analytics/budget-status', () => {
    it('returns budget vs actual for active projects', async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'p1', name: 'Alpha', slug: 'alpha', monthlyBudgetUsd: 100 },
        { id: 'p2', name: 'Beta', slug: 'beta', monthlyBudgetUsd: null },
      ]);
      mockPrisma.session.aggregate
        .mockResolvedValueOnce({ _sum: { costUsd: 75.5 }, _count: 42 })
        .mockResolvedValueOnce({ _sum: { costUsd: 12.3 }, _count: 8 });

      const app = createApp();
      const res = await request(app).get('/analytics/budget-status');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);

      const alpha = res.body.items.find((i: any) => i.projectSlug === 'alpha');
      expect(alpha.monthlyBudgetUsd).toBe(100);
      expect(alpha.actualCostUsd).toBe(75.5);
      expect(alpha.percentUsed).toBe(75.5);
      expect(alpha.sessionsThisMonth).toBe(42);

      const beta = res.body.items.find((i: any) => i.projectSlug === 'beta');
      expect(beta.percentUsed).toBeNull();
    });
  });

  describe('GET /analytics/export', () => {
    it('returns CSV with correct headers', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        {
          id: 's1',
          tool: 'claude-code',
          model: 'claude-sonnet-4-6',
          sessionType: 'human',
          status: 'ENDED',
          startedAt: new Date('2026-04-01'),
          endedAt: new Date('2026-04-01T01:00:00Z'),
          inputTokens: 5000,
          outputTokens: 2000,
          cacheCreationTokens: 100,
          cacheReadTokens: 50,
          costUsd: 0.05,
          projectSlug: 'alpha',
          project: { name: 'Alpha' },
        },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/export?days=30');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('pulse-sessions-30d.csv');

      const lines = res.text.split('\n');
      expect(lines[0]).toBe('id,project,tool,model,type,status,started_at,ended_at,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,cost_usd');
      expect(lines.length).toBe(2); // header + 1 data row
    });

    it('returns 204 when no sessions found', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);

      const app = createApp();
      const res = await request(app).get('/analytics/export?days=7');

      expect(res.status).toBe(204);
    });

    it('escapes CSV values with commas', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        {
          id: 's1',
          tool: 'claude-code',
          model: 'claude-sonnet-4-6',
          sessionType: 'human',
          status: 'ENDED',
          startedAt: new Date('2026-04-01'),
          endedAt: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 0,
          projectSlug: 'test,project',
          project: { name: 'Test, Project' },
        },
      ]);

      const app = createApp();
      const res = await request(app).get('/analytics/export');

      expect(res.text).toContain('"Test, Project"');
    });
  });
});
