import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockAlertManager = vi.hoisted(() => ({
  batchMarkRead: vi.fn(),
  batchDismiss: vi.fn(),
  getAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getById: vi.fn(),
  markRead: vi.fn(),
  dismiss: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('../../src/services/intelligence/alert-manager.js', () => ({
  alertManager: mockAlertManager,
}));

import { alertsRouter } from '../../src/routes/alerts.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/alerts', alertsRouter);
  return app;
}

describe('Alerts route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('PUT /alerts/batch/read', () => {
    it('rejects missing ids', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/read').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ids');
    });

    it('rejects empty ids array', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/read').send({ ids: [] });
      expect(res.status).toBe(400);
    });

    it('accepts valid ids array', async () => {
      const app = createApp();
      mockAlertManager.batchMarkRead.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/read').send({ ids: ['a1', 'a2'] });
      expect(res.status).toBe(200);
      expect(mockAlertManager.batchMarkRead).toHaveBeenCalledWith(['a1', 'a2'], undefined);
    });
  });

  describe('PUT /alerts/batch/dismiss', () => {
    it('rejects non-array ids', async () => {
      const app = createApp();
      const res = await request(app).put('/alerts/batch/dismiss').send({ ids: 'not-array' });
      expect(res.status).toBe(400);
    });

    it('accepts valid ids array', async () => {
      const app = createApp();
      mockAlertManager.batchDismiss.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/dismiss').send({ ids: ['a1'] });
      expect(res.status).toBe(200);
      expect(mockAlertManager.batchDismiss).toHaveBeenCalledWith(['a1'], undefined);
    });
  });
});
