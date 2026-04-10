import { prisma } from './prisma.js';

const TENANT_MODELS = new Set([
  'Session', 'TokenEvent', 'Rule', 'Alert', 'Insight', 'Webhook', 'ApiKey',
]);

export function createTenantPrisma(orgId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query, model }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);

        // Inject orgId into where clauses (find, update, delete)
        if ('where' in args && args.where) {
          (args.where as Record<string, unknown>).orgId = orgId;
        }
        // Inject orgId into create data
        if ('data' in args && args.data && typeof args.data === 'object') {
          (args.data as Record<string, unknown>).orgId = orgId;
        }

        return query(args);
      },
    },
  }) as unknown as typeof prisma;
}
