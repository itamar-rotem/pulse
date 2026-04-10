import { describe, it, expect, vi, beforeEach } from 'vitest';

// Integration-style test: mocks the base prisma client to simulate a
// per-org store, then runs the REAL createTenantPrisma extension against
// it and verifies no tenant can observe another tenant's rows.
//
// The real extension (see src/services/tenant-prisma.ts) mutates
// `args.where.orgId` / `args.data.orgId` before calling `query(args)`.
// So our mock can:
//   1. Forward `args` to the handler
//   2. After `handler()` returns, read the injected orgId from the args
//   3. Route reads/writes to a per-org bucket accordingly

const mockPrisma = vi.hoisted(() => {
  const store: Record<string, Record<string, any[]>> = {};

  const makeModelOps = (modelName: string, handlerRef: { fn: Function | null }) => ({
    create: vi.fn(async (args: any) => {
      const modifiedArgs = { data: { ...(args?.data ?? {}) } };
      // Fire the extension handler; `query` is what the extension would
      // normally invoke on the underlying client — we just need it to
      // return something so the handler resolves.
      await handlerRef.fn!({
        args: modifiedArgs,
        query: async (a: any) => a,
        model: modelName,
      });
      const orgId = modifiedArgs.data.orgId;
      const record = { id: Math.random().toString(36).slice(2), ...modifiedArgs.data };
      if (!store[orgId]) store[orgId] = {};
      if (!store[orgId][modelName]) store[orgId][modelName] = [];
      store[orgId][modelName].push(record);
      return record;
    }),
    findMany: vi.fn(async (args: any) => {
      const modifiedArgs = { where: { ...(args?.where ?? {}) } };
      await handlerRef.fn!({
        args: modifiedArgs,
        query: async (a: any) => a,
        model: modelName,
      });
      const orgId = modifiedArgs.where.orgId;
      return store[orgId]?.[modelName] ?? [];
    }),
  });

  return {
    $extends: vi.fn((ext: any) => {
      const handlerRef = { fn: ext.query.$allOperations as Function };
      return {
        rule: makeModelOps('Rule', handlerRef),
        session: makeModelOps('Session', handlerRef),
        _store: store,
      };
    }),
    _store: store,
  };
});

vi.mock('../src/services/prisma.js', () => ({ prisma: mockPrisma }));

import { createTenantPrisma } from '../src/services/tenant-prisma.js';

describe('Cross-tenant isolation (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the shared per-org store between tests
    for (const key of Object.keys(mockPrisma._store)) delete mockPrisma._store[key];
  });

  it('org A cannot see org B rules', async () => {
    const prismaA = createTenantPrisma('org-a') as any;
    const prismaB = createTenantPrisma('org-b') as any;

    await prismaA.rule.create({ data: { name: 'Rule A', type: 'COST_CAP_SESSION' } });
    await prismaB.rule.create({ data: { name: 'Rule B', type: 'COST_CAP_DAILY' } });

    const rulesA = await prismaA.rule.findMany({});
    const rulesB = await prismaB.rule.findMany({});

    expect(rulesA).toHaveLength(1);
    expect(rulesA[0].name).toBe('Rule A');
    expect(rulesA[0].orgId).toBe('org-a');

    expect(rulesB).toHaveLength(1);
    expect(rulesB[0].name).toBe('Rule B');
    expect(rulesB[0].orgId).toBe('org-b');

    // And a cross-check: neither list contains the other's row
    expect(rulesA.find((r: any) => r.name === 'Rule B')).toBeUndefined();
    expect(rulesB.find((r: any) => r.name === 'Rule A')).toBeUndefined();
  });

  it('tenant isolation applies to Session as well (extension is broad)', async () => {
    const prismaA = createTenantPrisma('org-a') as any;
    const prismaB = createTenantPrisma('org-b') as any;

    await prismaA.session.create({ data: { externalId: 'sess-a-1' } });
    await prismaA.session.create({ data: { externalId: 'sess-a-2' } });
    await prismaB.session.create({ data: { externalId: 'sess-b-1' } });

    const sessionsA = await prismaA.session.findMany({});
    const sessionsB = await prismaB.session.findMany({});

    expect(sessionsA).toHaveLength(2);
    expect(sessionsA.every((s: any) => s.orgId === 'org-a')).toBe(true);
    expect(sessionsA.map((s: any) => s.externalId).sort()).toEqual(['sess-a-1', 'sess-a-2']);

    expect(sessionsB).toHaveLength(1);
    expect(sessionsB[0].orgId).toBe('org-b');
    expect(sessionsB[0].externalId).toBe('sess-b-1');
  });

  it('findMany with a pre-existing where clause still gets orgId injected', async () => {
    const prismaA = createTenantPrisma('org-a') as any;
    const prismaB = createTenantPrisma('org-b') as any;

    await prismaA.rule.create({ data: { name: 'Rule A', type: 'COST_CAP_SESSION' } });
    await prismaB.rule.create({ data: { name: 'Rule B', type: 'COST_CAP_SESSION' } });

    // Even when A queries with a where clause, the extension pins orgId = org-a.
    // Attempting to "cheat" by passing orgId: 'org-b' gets overwritten by the
    // extension (last-write-wins on the mutated object).
    const rulesA = await prismaA.rule.findMany({ where: { orgId: 'org-b' } });

    expect(rulesA).toHaveLength(1);
    expect(rulesA[0].name).toBe('Rule A');
    expect(rulesA[0].orgId).toBe('org-a');
  });
});
