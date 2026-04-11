import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Race-safety coverage for upsertProjectForAgent.
 *
 * The production code relies on Prisma's compound unique `orgId_slug` to make
 * two concurrent "first session for project X in org A" events idempotent:
 * both token_events should resolve to the same Project row without either
 * throwing a P2002 unique violation. We verify that the service uses `upsert`
 * with the compound unique key rather than a racy find-then-create and that
 * parallel calls resolve to the same row.
 */

const mockPrisma = vi.hoisted(() => ({
  project: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => mockPrisma) }));
vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import {
  upsertProjectForAgent,
  validateSlug,
} from '../src/services/project-service.js';

describe('upsertProjectForAgent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the compound unique orgId_slug on upsert (no find-then-create)', async () => {
    mockPrisma.project.upsert.mockResolvedValue({ id: 'p1', slug: 'alpha' });

    await upsertProjectForAgent('org-A', 'alpha');

    expect(mockPrisma.project.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.project.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ orgId_slug: { orgId: 'org-A', slug: 'alpha' } });
    expect(call.create).toMatchObject({
      orgId: 'org-A',
      slug: 'alpha',
      name: 'alpha',
      status: 'ACTIVE',
    });
    // Never fall back to racy find-then-create.
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.project.create).not.toHaveBeenCalled();
  });

  it('concurrent callers for the same org+slug resolve to the same project', async () => {
    // Simulate Postgres semantics: two concurrent upserts both return the same
    // existing row. (The second caller would hit the unique index and take the
    // "update empty" branch, returning the same id.)
    mockPrisma.project.upsert.mockResolvedValue({ id: 'proj-alpha', slug: 'alpha' });

    const [a, b, c] = await Promise.all([
      upsertProjectForAgent('org-A', 'alpha'),
      upsertProjectForAgent('org-A', 'alpha'),
      upsertProjectForAgent('org-A', 'alpha'),
    ]);

    expect(a.id).toBe('proj-alpha');
    expect(b.id).toBe('proj-alpha');
    expect(c.id).toBe('proj-alpha');
    expect(mockPrisma.project.upsert).toHaveBeenCalledTimes(3);
  });

  it('the same slug in two different orgs yields two distinct projects', async () => {
    // First call: org-A/alpha → proj-A-alpha
    // Second call: org-B/alpha → proj-B-alpha (a DIFFERENT row)
    mockPrisma.project.upsert
      .mockResolvedValueOnce({ id: 'proj-A-alpha', slug: 'alpha' })
      .mockResolvedValueOnce({ id: 'proj-B-alpha', slug: 'alpha' });

    const a = await upsertProjectForAgent('org-A', 'alpha');
    const b = await upsertProjectForAgent('org-B', 'alpha');

    expect(a.id).toBe('proj-A-alpha');
    expect(b.id).toBe('proj-B-alpha');
    expect(a.id).not.toBe(b.id);

    // Check both orgs went through the compound unique.
    const [firstCall, secondCall] = mockPrisma.project.upsert.mock.calls;
    expect(firstCall[0].where).toEqual({ orgId_slug: { orgId: 'org-A', slug: 'alpha' } });
    expect(secondCall[0].where).toEqual({ orgId_slug: { orgId: 'org-B', slug: 'alpha' } });
  });
});

describe('validateSlug', () => {
  it('accepts lowercase alphanumerics, dashes, and underscores', () => {
    expect(validateSlug('alpha')).toBe(true);
    expect(validateSlug('alpha-bravo')).toBe(true);
    expect(validateSlug('alpha_bravo_1')).toBe(true);
    expect(validateSlug('a1b2c3')).toBe(true);
  });

  it('rejects uppercase, spaces, leading dashes, and invalid chars', () => {
    expect(validateSlug('')).toBe(false);
    expect(validateSlug('Alpha')).toBe(false);
    expect(validateSlug('alpha beta')).toBe(false);
    expect(validateSlug('-alpha')).toBe(false);
    expect(validateSlug('alpha/beta')).toBe(false);
    expect(validateSlug('alpha.beta')).toBe(false);
  });

  it('rejects slugs over 64 chars', () => {
    expect(validateSlug('a'.repeat(64))).toBe(true);
    expect(validateSlug('a'.repeat(65))).toBe(false);
  });
});
