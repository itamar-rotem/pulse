import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  webhook: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: () => mockPrisma,
}));
vi.mock('../../src/services/intelligence/webhook-service.js', () => ({
  webhookService: { test: vi.fn() },
}));

import { webhooksRouter } from '../../src/routes/webhooks.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { orgId: 'test-org', role: 'ADMIN' };
    (req as any).prisma = mockPrisma;
    next();
  });
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('Webhooks route validation', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /webhooks', () => {
    it('rejects invalid URL', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'not-a-url', events: ['ANOMALY'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('rejects empty events array', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('events');
    });

    it('rejects invalid event types', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['INVALID'] });
      expect(res.status).toBe(400);
    });

    it('accepts valid webhook creation', async () => {
      const app = createApp();
      mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-1', name: 'Test', secret: null });

      const res = await request(app)
        .post('/webhooks')
        .send({ name: 'Test', url: 'https://example.com/hook', events: ['ANOMALY', 'RULE_BREACH'] });
      expect(res.status).toBe(201);
    });
  });
});
