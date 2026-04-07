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
import { alertManager } from '../src/services/intelligence/alert-manager.js';

describe('InsightGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: findMany returns empty array (analyzePeakUsage needs < 10 sessions to short-circuit)
    mockPrisma.session.findMany.mockResolvedValue([]);
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
        metadata: { suggestedRule: { type: 'MODEL_RESTRICTION' } },
      });

      await expect(insightGenerator.applyInsight('i2')).rejects.toThrow('missing required fields');
    });
  });

  describe('analyzePeakUsage', () => {
    it('detects concentrated usage in a 4-hour window', async () => {
      // Create 12 sessions concentrated at hours 14-17 UTC
      const sessions = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date();
        d.setUTCHours(14 + (i % 4), 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - (i % 6)); // spread over 6 days
        sessions.push({ startedAt: d, costUsd: 10 });
      }
      // Add 2 sessions at different hours with low cost
      for (let i = 0; i < 2; i++) {
        const d = new Date();
        d.setUTCHours(3, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        sessions.push({ startedAt: d, costUsd: 1 });
      }

      mockPrisma.session.findMany.mockResolvedValue(sessions);
      // Model optimization + spend distribution return nothing
      mockPrisma.session.groupBy.mockResolvedValue([]);
      // Cost trends: 2 aggregate calls, then plan recommendation: 1 aggregate call
      mockPrisma.session.aggregate
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { costUsd: 0 } });
      // No existing duplicate
      mockPrisma.insight.findFirst.mockResolvedValue(null);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'peak-1', ...args.data }));

      const insights = await insightGenerator.analyze();

      const peakInsight = insights.find((i) => i.category === 'USAGE_PATTERN' && i.title.includes('Peak usage'));
      expect(peakInsight).toBeDefined();
      expect(peakInsight!.title).toContain('UTC');
    });

    it('does not fire when usage is spread evenly', async () => {
      // Create 24 sessions, one per hour with equal cost
      const sessions = [];
      for (let i = 0; i < 24; i++) {
        const d = new Date();
        d.setUTCHours(i, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - 1);
        sessions.push({ startedAt: d, costUsd: 10 });
      }

      mockPrisma.session.findMany.mockResolvedValue(sessions);
      mockPrisma.session.groupBy.mockResolvedValue([]);
      mockPrisma.session.aggregate
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { costUsd: 0 } });
      mockPrisma.insight.findFirst.mockResolvedValue(null);

      const insights = await insightGenerator.analyze();

      const peakInsight = insights.find((i) => i.category === 'USAGE_PATTERN' && i.title.includes('Peak usage'));
      expect(peakInsight).toBeUndefined();
    });
  });

  describe('analyzePlanRecommendation', () => {
    it('suggests upgrade when spend far exceeds plan cost', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]); // < 10 sessions, peak usage skips
      mockPrisma.session.groupBy.mockResolvedValue([]); // no model/spend insights
      // analyzeCostTrends calls aggregate twice (this week, last week)
      mockPrisma.session.aggregate
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 }) // cost trends: this week
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 }) // cost trends: last week
        .mockResolvedValueOnce({ _sum: { costUsd: 600 } }); // plan recommendation: 6x the $100 plan
      mockPrisma.insight.findFirst.mockResolvedValue(null);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'plan-1', ...args.data }));

      const insights = await insightGenerator.analyze();

      const planInsight = insights.find((i) => i.category === 'PLAN_RECOMMENDATION');
      expect(planInsight).toBeDefined();
      expect(planInsight!.title).toContain('6x value');
    });

    it('suggests downgrade when utilization is low', async () => {
      mockPrisma.session.findMany.mockResolvedValue([]);
      mockPrisma.session.groupBy.mockResolvedValue([]);
      // analyzeCostTrends calls aggregate twice, then planRecommendation calls once
      mockPrisma.session.aggregate
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _avg: { costUsd: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { costUsd: 20 } }); // 20% of $100 plan
      mockPrisma.insight.findFirst.mockResolvedValue(null);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'plan-2', ...args.data }));

      const insights = await insightGenerator.analyze();

      const planInsight = insights.find((i) => i.category === 'PLAN_RECOMMENDATION');
      expect(planInsight).toBeDefined();
      expect(planInsight!.title).toContain('Low plan utilization');
    });
  });

  describe('weeklyDigest', () => {
    it('creates digest insight and alert', async () => {
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 450 }, _count: 85 });
      mockPrisma.alert.count.mockResolvedValue(12);
      mockPrisma.insight.create.mockImplementation((args: any) => Promise.resolve({ id: 'digest-1', ...args.data }));

      const insight = await insightGenerator.weeklyDigest();

      expect(insight).toBeDefined();
      expect(insight!.title).toContain('85 sessions');
      expect(insight!.title).toContain('$450');
      expect(alertManager.create).toHaveBeenCalled();
    });
  });
});
