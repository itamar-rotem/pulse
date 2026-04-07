import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const mockPrisma = vi.hoisted(() => ({
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
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
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
