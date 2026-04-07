import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  rule: { findMany: vi.fn() },
  session: { aggregate: vi.fn() },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));

const mockRedis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../src/services/redis.js', () => ({
  redis: mockRedis,
}));

import { ruleEngine } from '../src/services/intelligence/rule-engine.js';

describe('RuleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ruleEngine._setRulesForTest([]);
  });

  describe('evaluate — COST_CAP_SESSION', () => {
    it('returns PAUSE violation when session cost exceeds cap', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Session cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'PAUSE', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 55, projectSlug: 'my-project', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('r1');
      expect(violations[0].action).toBe('PAUSE');
      expect(violations[0].severity).toBe('CRITICAL');
    });

    it('returns no violation when under cap', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Session cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'PAUSE', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 30, projectSlug: 'my-project', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('evaluate — MODEL_RESTRICTION', () => {
    it('returns BLOCK violation when model not in allowed list', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r2', name: 'Sonnet only', type: 'MODEL_RESTRICTION', scope: { projectName: 'beta' }, condition: { allowedModels: ['claude-sonnet-4-6'] }, action: 'BLOCK', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', model: 'claude-opus-4-6', burnRatePerMin: 500 } as any,
        { id: 's1', costUsd: 10, projectSlug: 'beta', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('BLOCK');
    });

    it('skips rule when project does not match scope', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r2', name: 'Sonnet only', type: 'MODEL_RESTRICTION', scope: { projectName: 'beta' }, condition: { allowedModels: ['claude-sonnet-4-6'] }, action: 'BLOCK', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', model: 'claude-opus-4-6', burnRatePerMin: 500 } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('evaluate — BURN_RATE_LIMIT', () => {
    it('returns ALERT on first burn rate violation', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r3', name: 'Rate limit', type: 'BURN_RATE_LIMIT', scope: { global: true }, condition: { maxRate: 10000 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 15000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 5, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('ALERT');
    });
  });

  describe('evaluate — SESSION_DURATION', () => {
    it('returns PAUSE when session exceeds max duration', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r4', name: 'Max 60 min', type: 'SESSION_DURATION', scope: { global: true }, condition: { maxMinutes: 60 }, action: 'PAUSE', enabled: true },
      ]);

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 5, projectSlug: 'alpha', sessionType: 'human', startedAt: twoHoursAgo } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].action).toBe('PAUSE');
    });
  });

  describe('scope matching', () => {
    it('global scope matches any session', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Global cap', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 10 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 100, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 15, projectSlug: 'anything', sessionType: 'agent_local', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
    });

    it('sessionType scope filters correctly', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r1', name: 'Agent cap', type: 'COST_CAP_SESSION', scope: { sessionType: 'agent_local' }, condition: { maxCost: 10 }, action: 'ALERT', enabled: true },
      ]);

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 100, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 15, projectSlug: 'test', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(0);
    });
  });

  describe('evaluate — COST_CAP_DAILY', () => {
    it('detects violation using Redis cached value', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r5', name: 'Daily cap', type: 'COST_CAP_DAILY', scope: { global: true }, condition: { maxCost: 200 }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue('250');

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'proj', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleType).toBe('COST_CAP_DAILY');
      expect(violations[0].severity).toBe('CRITICAL'); // 250 > 200*1.1
    });

    it('falls back to DB when Redis cache misses', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r5', name: 'Daily cap', type: 'COST_CAP_DAILY', scope: { global: true }, condition: { maxCost: 100 }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 150 } });

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'proj', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(mockPrisma.session.aggregate).toHaveBeenCalled();
    });
  });

  describe('evaluate — COST_CAP_PROJECT', () => {
    it('detects violation using Redis cached value', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r6', name: 'Project cap', type: 'COST_CAP_PROJECT', scope: { projectName: 'alpha' }, condition: { maxCost: 500, period: 'monthly' }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue('600');

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleType).toBe('COST_CAP_PROJECT');
    });

    it('falls back to DB and writes back to Redis on cache miss', async () => {
      ruleEngine._setRulesForTest([
        { id: 'r6', name: 'Project cap', type: 'COST_CAP_PROJECT', scope: { projectName: 'alpha' }, condition: { maxCost: 500, period: 'weekly' }, action: 'ALERT', enabled: true },
      ]);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockPrisma.session.aggregate.mockResolvedValue({ _sum: { costUsd: 600 } });

      const violations = await ruleEngine.evaluate(
        { sessionId: 's1', burnRatePerMin: 1000, model: 'claude-sonnet-4-6' } as any,
        { id: 's1', costUsd: 10, projectSlug: 'alpha', sessionType: 'human', startedAt: new Date() } as any,
      );

      expect(violations).toHaveLength(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pulse:project_cost:alpha:weekly',
        '600',
        'EX',
        7 * 86400,
      );
    });
  });
});
