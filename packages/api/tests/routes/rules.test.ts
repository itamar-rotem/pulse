import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  rule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { rulesRouter } from '../../src/routes/rules.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/rules', rulesRouter);
  return app;
}

describe('Rules route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /rules', () => {
    it('rejects missing name', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ type: 'COST_CAP_SESSION', scope: {}, condition: {}, action: 'ALERT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('rejects invalid type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ name: 'Test', type: 'INVALID', scope: {}, condition: {}, action: 'ALERT' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type');
    });

    it('rejects invalid action', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/rules')
        .send({ name: 'Test', type: 'COST_CAP_SESSION', scope: {}, condition: {}, action: 'DESTROY' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('action');
    });

    it('accepts valid input and strips protected fields', async () => {
      const app = createApp();
      mockPrisma.rule.create.mockResolvedValue({ id: 'r1', name: 'Test' });

      const res = await request(app)
        .post('/rules')
        .send({
          name: 'Test', type: 'COST_CAP_SESSION', scope: { global: true },
          condition: { maxCost: 50 }, action: 'ALERT',
          triggerCount: 999, enabled: false,
        });

      expect(res.status).toBe(201);
      expect(mockPrisma.rule.create).toHaveBeenCalledWith({
        data: { name: 'Test', type: 'COST_CAP_SESSION', scope: { global: true }, condition: { maxCost: 50 }, action: 'ALERT' },
      });
    });
  });
});
