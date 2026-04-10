import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
const mockPrisma = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  user: { upsert: vi.fn() },
}));

vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));
vi.mock('bcrypt', () => ({ default: { compare: vi.fn() } }));
vi.mock('../../src/services/tenant-prisma.js', () => ({
  createTenantPrisma: vi.fn(() => ({})),
}));

import { authMiddleware } from '../../src/middleware/auth.js';
import { tenantMiddleware } from '../../src/middleware/tenant.js';
import { requireRole } from '../../src/middleware/require-role.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/test', authMiddleware, tenantMiddleware, (_req, res) => {
    res.json({ orgId: _req.auth?.orgId, role: _req.auth?.role });
  });
  app.get('/admin-only', authMiddleware, tenantMiddleware, requireRole('OWNER', 'ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('Auth middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no credentials provided', async () => {
    const app = createApp();
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
  });

  it('authenticates with legacy API key', async () => {
    // Legacy key set via env
    process.env.AGENT_API_KEY = 'legacy-test-key';
    const app = createApp();
    const res = await request(app).get('/test').set('x-api-key', 'legacy-test-key');
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org_default_seed');
    expect(res.body.role).toBe('ADMIN');
    delete process.env.AGENT_API_KEY;
  });

  it('rejects invalid API key', async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app).get('/test').set('x-api-key', 'pk_live_invalid_key');
    expect(res.status).toBe(401);
  });
});

describe('requireRole middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows ADMIN to access admin-only route', async () => {
    process.env.AGENT_API_KEY = 'admin-key';
    const app = createApp();
    const res = await request(app).get('/admin-only').set('x-api-key', 'admin-key');
    expect(res.status).toBe(200);
    delete process.env.AGENT_API_KEY;
  });

  it('rejects MEMBER from admin-only route', async () => {
    // Simulate a Clerk token that resolves to MEMBER
    process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
    const { verifyToken } = await import('@clerk/backend');
    (verifyToken as any).mockResolvedValue({
      org_id: 'clerk_org_1',
      org_role: 'org:member',
      sub: 'user_1',
    });
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1', clerkOrgId: 'clerk_org_1' });
    mockPrisma.user.upsert.mockResolvedValue({});

    const app = createApp();
    const res = await request(app).get('/admin-only').set('Authorization', 'Bearer valid-clerk-token');
    expect(res.status).toBe(403);
    delete process.env.CLERK_SECRET_KEY;
  });
});
