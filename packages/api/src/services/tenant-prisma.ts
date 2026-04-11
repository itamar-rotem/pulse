import { prisma } from './prisma.js';

// Added in Sub-project 5 Task 1 — enforces tenant isolation on Project from the start.
const TENANT_MODELS = new Set([
  'Alert', 'ApiKey', 'Insight', 'Project', 'Rule', 'Session', 'TokenEvent', 'Webhook',
]);

export function createTenantPrisma(orgId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query, operation, model }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);

        // Inject orgId into where clauses (find, update, delete).
        if ('where' in args && args.where) {
          (args.where as Record<string, unknown>).orgId = orgId;
        }

        // Inject orgId into write payloads. Prisma's `createMany` takes an
        // array under `data`; setting `.orgId` on the array object (as we did
        // previously) would NOT populate each row and would trip the NOT NULL
        // constraint. Handle both shapes explicitly.
        //
        // WARNING: nested create/createMany inside relations are NOT auto-
        // injected with orgId. If you need nested writes on tenant models,
        // pass orgId explicitly in the nested data.
        if ('data' in args && args.data != null) {
          if (
            (operation === 'createMany' || operation === 'createManyAndReturn') &&
            Array.isArray(args.data)
          ) {
            (args as { data: unknown }).data = (args.data as Array<Record<string, unknown>>).map(
              (item) => ({ ...item, orgId }),
            );
          } else if (Array.isArray(args.data)) {
            // Defensive: any other op that somehow carries an array `data`.
            (args as { data: unknown }).data = (args.data as Array<Record<string, unknown>>).map(
              (item) => ({ ...item, orgId }),
            );
          } else if (typeof args.data === 'object') {
            (args.data as Record<string, unknown>).orgId = orgId;
          }
        }

        return query(args);
      },
    },
  }) as unknown as typeof prisma;
}
