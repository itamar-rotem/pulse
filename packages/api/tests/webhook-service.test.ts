import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  webhook: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('../src/services/prisma.js', () => ({
  prisma: mockPrisma,
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { webhookService } from '../src/services/intelligence/webhook-service.js';

// Helper: flush microtasks and any immediately-resolving promises
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('WebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Speed up retry delays by using fake timers where needed
  });

  describe('dispatch', () => {
    it('sends to matching webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      mockPrisma.webhook.update.mockResolvedValue({});

      await webhookService.dispatch({
        id: 'alert-1',
        type: 'ANOMALY',
        severity: 'WARNING',
        title: 'Spike',
        message: 'Burn rate spike',
        metadata: {},
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      } as any);

      // Allow fire-and-forget delivery to complete
      await settle();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('skips disabled webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      await webhookService.dispatch({ type: 'ANOMALY' } as any);

      await settle();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('increments failCount on delivery failure', async () => {
      vi.useFakeTimers();

      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 0 },
      ]);
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      mockPrisma.webhook.update.mockResolvedValue({});

      await webhookService.dispatch({ id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString() } as any);

      // Advance through all retry delays (1s + 5s + settle)
      await vi.runAllTimersAsync();

      vi.useRealTimers();

      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ failCount: { increment: 1 } }),
      });
    });

    it('auto-disables webhook after 5 consecutive failures', async () => {
      vi.useFakeTimers();

      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://hooks.example.com/test', secret: null, events: ['ANOMALY'], enabled: true, failCount: 4 },
      ]);
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      mockPrisma.webhook.update.mockResolvedValue({});

      await webhookService.dispatch({ id: 'a1', type: 'ANOMALY', severity: 'WARNING', title: 'T', message: 'M', metadata: {}, status: 'ACTIVE', createdAt: new Date().toISOString() } as any);

      // Advance through all retry delays
      await vi.runAllTimersAsync();

      vi.useRealTimers();

      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: expect.objectContaining({ enabled: false }),
      });
    });
  });

  describe('test', () => {
    it('sends test payload and returns success', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', url: 'https://hooks.example.com/test', secret: null,
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await webhookService.test('wh-1');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('returns failure info on error', async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', url: 'https://hooks.example.com/test', secret: null,
      });
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const result = await webhookService.test('wh-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DNS resolution failed');
    });
  });
});
