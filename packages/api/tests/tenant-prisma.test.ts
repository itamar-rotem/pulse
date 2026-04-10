import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the extension logic by verifying args are modified.
// Since $extends creates a wrapper, we test the function's behavior
// by mocking the underlying prisma and checking injected orgId.

const mockPrisma = vi.hoisted(() => ({
  $extends: vi.fn(),
}));

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('createTenantPrisma', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls $extends with query override', () => {
    mockPrisma.$extends.mockReturnValue({});
    createTenantPrisma('org-123');
    expect(mockPrisma.$extends).toHaveBeenCalledTimes(1);

    const extensionArg = mockPrisma.$extends.mock.calls[0][0];
    expect(extensionArg.query).toBeDefined();
    expect(extensionArg.query.$allOperations).toBeInstanceOf(Function);
  });

  it('injects orgId into where clause for tenant models', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-123');

    const mockQuery = vi.fn((args: any) => args);
    const args = { where: { id: 'some-id' } };
    capturedHandler!({ args, query: mockQuery, model: 'Session' });

    expect(args.where).toEqual({ id: 'some-id', orgId: 'org-123' });
    expect(mockQuery).toHaveBeenCalledWith(args);
  });

  it('injects orgId into create data for tenant models', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-456');

    const mockQuery = vi.fn((args: any) => args);
    const args = { data: { name: 'Test Rule' } };
    capturedHandler!({ args, query: mockQuery, model: 'Rule' });

    expect(args.data).toEqual({ name: 'Test Rule', orgId: 'org-456' });
  });

  it('injects orgId into each row of a createMany array', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-many');

    const mockQuery = vi.fn((args: any) => args);
    const args = {
      data: [
        { name: 'Rule A' },
        { name: 'Rule B' },
        { name: 'Rule C' },
      ],
    };
    capturedHandler!({ args, query: mockQuery, operation: 'createMany', model: 'Rule' });

    // Each row must have orgId, and the array (not array object) must carry them.
    expect(Array.isArray(args.data)).toBe(true);
    expect(args.data).toEqual([
      { name: 'Rule A', orgId: 'org-many' },
      { name: 'Rule B', orgId: 'org-many' },
      { name: 'Rule C', orgId: 'org-many' },
    ]);
    // Sanity: array object itself shouldn't have a stray orgId property
    expect((args.data as any).orgId).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith(args);
  });

  it('passes through non-tenant models unchanged', () => {
    let capturedHandler: Function;
    mockPrisma.$extends.mockImplementation((ext: any) => {
      capturedHandler = ext.query.$allOperations;
      return {};
    });

    createTenantPrisma('org-789');

    const mockQuery = vi.fn((args: any) => args);
    const args = { where: { id: 'u1' } };
    capturedHandler!({ args, query: mockQuery, model: 'Organization' });

    expect(args.where).toEqual({ id: 'u1' }); // no orgId injected
  });
});
