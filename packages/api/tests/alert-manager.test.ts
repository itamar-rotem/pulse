import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = vi.hoisted(() => ({
  alert: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  rule: {
    update: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// Mock redis
vi.mock('../src/services/redis.js', () => ({
  publishAlert: vi.fn(),
}));

// Mock webhook service
vi.mock('../src/services/intelligence/webhook-service.js', () => ({
  webhookService: { dispatch: vi.fn() },
}));

import { alertManager } from '../src/services/intelligence/alert-manager.js';

describe('AlertManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('persists alert and returns it', async () => {
      const mockAlert = {
        id: 'alert-1',
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Burn rate spike',
        message: 'Session xyz burn rate 5x above baseline',
        metadata: {},
        status: 'ACTIVE',
        sessionId: 'session-1',
        ruleId: null,
        insightId: null,
        createdAt: new Date(),
        readAt: null,
        dismissedAt: null,
      };
      mockPrisma.alert.create.mockResolvedValue(mockAlert);

      const result = await alertManager.create({
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Burn rate spike',
        message: 'Session xyz burn rate 5x above baseline',
        sessionId: 'session-1',
      });

      expect(result.id).toBe('alert-1');
      expect(mockPrisma.alert.create).toHaveBeenCalledOnce();
    });

    it('updates rule triggerCount when ruleId is provided', async () => {
      mockPrisma.alert.create.mockResolvedValue({
        id: 'alert-2',
        type: 'RULE_BREACH',
        severity: 'CRITICAL',
        ruleId: 'rule-1',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
      mockPrisma.rule.update.mockResolvedValue({});

      await alertManager.create({
        type: 'RULE_BREACH',
        severity: 'CRITICAL',
        title: 'Cost cap exceeded',
        message: 'Over $50',
        ruleId: 'rule-1',
      });

      expect(mockPrisma.rule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { triggerCount: { increment: 1 }, lastTriggeredAt: expect.any(Date) },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('counts ACTIVE alerts', async () => {
      mockPrisma.alert.count.mockResolvedValue(5);

      const count = await alertManager.getUnreadCount();

      expect(count).toBe(5);
      expect(mockPrisma.alert.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
    });
  });

  describe('markRead', () => {
    it('sets status to READ and readAt timestamp', async () => {
      mockPrisma.alert.update.mockResolvedValue({});

      await alertManager.markRead('alert-1');

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { status: 'READ', readAt: expect.any(Date) },
      });
    });
  });

  describe('dismiss', () => {
    it('sets status to DISMISSED and dismissedAt timestamp', async () => {
      mockPrisma.alert.update.mockResolvedValue({});

      await alertManager.dismiss('alert-1');

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { status: 'DISMISSED', dismissedAt: expect.any(Date) },
      });
    });
  });

  describe('batchMarkRead', () => {
    it('updates multiple alerts at once', async () => {
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 3 });

      await alertManager.batchMarkRead(['a1', 'a2', 'a3']);

      expect(mockPrisma.alert.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2', 'a3'] } },
        data: { status: 'READ', readAt: expect.any(Date) },
      });
    });
  });

  describe('getAlerts', () => {
    it('applies filters and pagination', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(0);

      await alertManager.getAlerts({ status: 'ACTIVE', severity: 'CRITICAL', page: 2, limit: 10 });

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', severity: 'CRITICAL' },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });
  });
});
