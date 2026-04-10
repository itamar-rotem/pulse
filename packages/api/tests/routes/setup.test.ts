import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { setupRouter } from '../../src/routes/setup.js';

function createApp(auth?: { orgId: string; userId?: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (auth) (req as any).auth = auth;
    next();
  });
  app.use('/api/setup', setupRouter);
  return app;
}

describe('Setup claim endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    const res = await request(createApp()).post('/api/setup/claim').send({});
    expect(res.status).toBe(401);
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('claims the seed org when it exists and is unclaimed', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org_default_seed',
      clerkOrgId: null,
    });
    mockPrisma.organization.update.mockResolvedValue({
      id: 'org_default_seed',
      clerkOrgId: 'clerk-org-id',
    });

    const app = createApp({ orgId: 'clerk-org-id', userId: 'user-1', role: 'OWNER' });
    const res = await request(app).post('/api/setup/claim').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ claimed: true, orgId: 'org_default_seed' });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_default_seed' },
      data: { clerkOrgId: 'clerk-org-id' },
    });
  });

  it('returns 409 when seed org is already claimed', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org_default_seed',
      clerkOrgId: 'already-claimed',
    });

    const app = createApp({ orgId: 'clerk-org-id', userId: 'user-1', role: 'OWNER' });
    const res = await request(app).post('/api/setup/claim').send({});

    expect(res.status).toBe(409);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });

  it('returns 404 when seed org does not exist', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);

    const app = createApp({ orgId: 'clerk-org-id', userId: 'user-1', role: 'OWNER' });
    const res = await request(app).post('/api/setup/claim').send({});

    expect(res.status).toBe(404);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
  });
});
