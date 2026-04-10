import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  organization: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockVerify = vi.hoisted(() => vi.fn((body: any) => JSON.parse(body.toString())));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../../src/services/prisma.js', () => ({ prisma: mockPrisma }));

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

import { clerkWebhookRouter } from '../../src/routes/clerk-webhook.js';

function createApp() {
  const app = express();
  // NOTE: intentionally NOT mounting express.json() before the webhook,
  // mirroring the real app.ts wiring order.
  app.use('/api/clerk/webhook', clerkWebhookRouter);
  return app;
}

describe('Clerk webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockImplementation((body: any) => JSON.parse(body.toString()));
  });

  it('creates organization on organization.created event', async () => {
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-1' });

    const payload = {
      type: 'organization.created',
      data: { id: 'clerk_org_1', name: 'Acme', slug: 'acme' },
    };

    const res = await request(createApp())
      .post('/api/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_1')
      .set('svix-timestamp', '1700000000')
      .set('svix-signature', 'v1,abc')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: { clerkOrgId: 'clerk_org_1', name: 'Acme', slug: 'acme' },
    });
  });

  it('upserts user on organizationMembership.created event', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-local-1' });
    mockPrisma.user.upsert.mockResolvedValue({});

    const payload = {
      type: 'organizationMembership.created',
      data: {
        role: 'basic_member',
        organization: { id: 'clerk_org_1' },
        public_user_data: {
          user_id: 'user_abc',
          email_address: 'user@example.com',
          first_name: 'Alice',
        },
      },
    };

    const res = await request(createApp())
      .post('/api/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_2')
      .set('svix-timestamp', '1700000000')
      .set('svix-signature', 'v1,abc')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: 'clerk_org_1' },
    });
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_abc' },
      update: { orgId: 'org-local-1', role: 'MEMBER' },
      create: {
        clerkUserId: 'user_abc',
        email: 'user@example.com',
        name: 'Alice',
        orgId: 'org-local-1',
        role: 'MEMBER',
      },
    });
  });

  it('deletes user on organizationMembership.deleted event and swallows not-found errors', async () => {
    mockPrisma.user.delete.mockRejectedValue(new Error('Record not found'));

    const payload = {
      type: 'organizationMembership.deleted',
      data: {
        public_user_data: { user_id: 'user_missing' },
      },
    };

    const res = await request(createApp())
      .post('/api/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_3')
      .set('svix-timestamp', '1700000000')
      .set('svix-signature', 'v1,abc')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_missing' },
    });
  });

  it('returns 400 on invalid signature', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const payload = {
      type: 'organization.created',
      data: { id: 'clerk_org_1', name: 'Acme', slug: 'acme' },
    };

    const res = await request(createApp())
      .post('/api/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_4')
      .set('svix-timestamp', '1700000000')
      .set('svix-signature', 'v1,bad')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Webhook verification failed');
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
  });
});
