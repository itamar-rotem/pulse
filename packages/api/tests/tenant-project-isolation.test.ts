import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $extends: vi.fn(),
}));

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('Project tenant isolation via createTenantPrisma', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects orgId into Project.findMany where clause', () => {
    let handler: Function | undefined;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      handler = ext.query.$allOperations;
      return {};
    });
    createTenantPrisma('org-A');

    const mockQuery = vi.fn((a: any) => a);
    const args: any = { where: { status: 'ACTIVE' } };
    handler!({ args, query: mockQuery, operation: 'findMany', model: 'Project' });
    expect(args.where).toEqual({ status: 'ACTIVE', orgId: 'org-A' });
  });

  it('injects orgId into Project.create data', () => {
    let handler: Function | undefined;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      handler = ext.query.$allOperations;
      return {};
    });
    createTenantPrisma('org-B');

    const mockQuery = vi.fn((a: any) => a);
    const args: any = { data: { slug: 'my-app', name: 'My App' } };
    handler!({ args, query: mockQuery, operation: 'create', model: 'Project' });
    expect(args.data).toEqual({ slug: 'my-app', name: 'My App', orgId: 'org-B' });
  });
});
