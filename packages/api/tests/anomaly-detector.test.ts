import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../src/services/redis.js', () => ({ redis: mockRedis }));

import { anomalyDetector } from '../src/services/intelligence/anomaly-detector.js';

describe('AnomalyDetector', () => {
  beforeEach(() => {
    anomalyDetector._resetForTest();
  });

  describe('burn rate spike', () => {
    it('detects 3x burn rate spike as WARNING', async () => {
      // Feed baseline: 10 events at 1000 tok/min
      for (let i = 0; i < 10; i++) {
        await anomalyDetector.check(
          { sessionId: `s${i}`, burnRatePerMin: 1000, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
          { id: `s${i}`, sessionType: 'human' } as any,
        );
      }

      // Spike at 3500 tok/min (3.5x)
      const anomalies = await anomalyDetector.check(
        { sessionId: 's-spike', burnRatePerMin: 3500, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
        { id: 's-spike', sessionType: 'human' } as any,
      );

      const spike = anomalies.find((a) => a.type === 'burn_rate_spike');
      expect(spike).toBeDefined();
      expect(spike!.severity).toBe('WARNING');
    });

    it('detects 5x burn rate spike as CRITICAL', async () => {
      for (let i = 0; i < 10; i++) {
        await anomalyDetector.check(
          { sessionId: `s${i}`, burnRatePerMin: 1000, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
          { id: `s${i}`, sessionType: 'human' } as any,
        );
      }

      const anomalies = await anomalyDetector.check(
        { sessionId: 's-spike', burnRatePerMin: 5500, inputTokens: 500, outputTokens: 500, cacheReadTokens: 0 } as any,
        { id: 's-spike', sessionType: 'human' } as any,
      );

      const spike = anomalies.find((a) => a.type === 'burn_rate_spike');
      expect(spike).toBeDefined();
      expect(spike!.severity).toBe('CRITICAL');
    });
  });

  describe('generation loop', () => {
    it('detects output ratio > 0.95 sustained over 3 events', async () => {
      const session = { id: 's1', sessionType: 'human' } as any;

      // 3 events with 95%+ output ratio
      for (let i = 0; i < 3; i++) {
        await anomalyDetector.check(
          { sessionId: 's1', burnRatePerMin: 1000, inputTokens: 10, outputTokens: 500, cacheReadTokens: 0 } as any,
          session,
        );
      }

      const anomalies = await anomalyDetector.check(
        { sessionId: 's1', burnRatePerMin: 1000, inputTokens: 10, outputTokens: 500, cacheReadTokens: 0 } as any,
        session,
      );

      const loop = anomalies.find((a) => a.type === 'generation_loop');
      expect(loop).toBeDefined();
      expect(loop!.severity).toBe('WARNING');
    });
  });

  describe('cost velocity', () => {
    it('detects session cost extrapolating over $100', async () => {
      const session = { id: 's1', sessionType: 'human' } as any;

      // Simulate rapid cost accumulation in recent events
      const anomalies = await anomalyDetector.check(
        { sessionId: 's1', burnRatePerMin: 50000, inputTokens: 100000, outputTokens: 100000, cacheReadTokens: 0, costDeltaUsd: 25, cumulativeCostUsd: 80 } as any,
        session,
      );

      const velocity = anomalies.find((a) => a.type === 'cost_velocity');
      expect(velocity).toBeDefined();
      expect(velocity!.severity).toBe('WARNING');
    });
  });
});
