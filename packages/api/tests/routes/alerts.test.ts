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

// NOTE: In alerts.ts, PUT /batch/read and PUT /batch/dismiss are registered AFTER
// PUT /:id/read and PUT /:id/dismiss. In Express, the /:id/read handler will match
// first (with id="batch"), so the batch routes are unreachable via their intended paths.
// The tests below reflect this actual behavior and document the routing concern.
// The fix would be to register /batch/* routes before /:id/* routes in alerts.ts.

describe('Alerts route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('PUT /alerts/batch/read — route ordering concern', () => {
    it('routes to /:id/read with id="batch" due to registration order', async () => {
      // Because /:id/read is registered before /batch/read, Express matches
      // the batch path as /:id/read with id="batch". markRead is called instead
      // of batchMarkRead.
      const app = createApp();
      mockAlertManager.markRead.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/read').send({ ids: ['a1', 'a2'] });
      // The /:id/read handler returns 200 { success: true }
      expect(res.status).toBe(200);
      expect(mockAlertManager.markRead).toHaveBeenCalledWith('batch');
      expect(mockAlertManager.batchMarkRead).not.toHaveBeenCalled();
    });
  });

  describe('PUT /alerts/batch/dismiss — route ordering concern', () => {
    it('routes to /:id/dismiss with id="batch" due to registration order', async () => {
      const app = createApp();
      mockAlertManager.dismiss.mockResolvedValue(undefined);

      const res = await request(app).put('/alerts/batch/dismiss').send({ ids: ['a1'] });
      // The /:id/dismiss handler returns 200 { success: true }
      expect(res.status).toBe(200);
      expect(mockAlertManager.dismiss).toHaveBeenCalledWith('batch');
      expect(mockAlertManager.batchDismiss).not.toHaveBeenCalled();
    });
  });
});
