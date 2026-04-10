import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  apiKey: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: () => mockPrisma,
}));

import { apiKeysRouter } from '../../src/routes/api-keys.js';

function createApp(role: string = 'ADMIN') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).auth = { orgId: 'org-1', userId: 'user-1', role };
    (req as any).prisma = mockPrisma;
    next();
  });
  app.use('/api-keys', apiKeysRouter);
  return app;
}

describe('API Keys routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api-keys', () => {
    it('creates a key and returns it once', async () => {
      mockPrisma.apiKey.create.mockResolvedValue({
        id: 'key-1',
        name: 'Deploy Key',
        prefix: 'pk_live_abcd',
        createdAt: new Date(),
      });

      const app = createApp();
      const res = await request(app).post('/api-keys').send({ name: 'Deploy Key' });

      expect(res.status).toBe(201);
      expect(res.body.key).toMatch(/^pk_live_/);
      expect(res.body.key.length).toBe(40); // pk_live_ (8) + 32 hex chars
      expect(res.body.name).toBe('Deploy Key');
    });

    it('rejects missing name', async () => {
      const app = createApp();
      const res = await request(app).post('/api-keys').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api-keys', () => {
    it('returns list of active keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        { id: 'k1', prefix: 'pk_live_abc', name: 'Prod', createdBy: { email: 'a@b.com', name: 'A' }, lastUsedAt: null, createdAt: new Date() },
      ]);
      const app = createApp();
      const res = await request(app).get('/api-keys');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].prefix).toBe('pk_live_abc');
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('soft-deletes by setting revokedAt', async () => {
      mockPrisma.apiKey.update.mockResolvedValue({});
      const app = createApp();
      const res = await request(app).delete('/api-keys/key-1');
      expect(res.status).toBe(200);
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('Role enforcement', () => {
    it('rejects MEMBER role', async () => {
      const app = createApp('MEMBER');
      const res = await request(app).get('/api-keys');
      expect(res.status).toBe(403);
    });
  });
});
