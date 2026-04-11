import type { PrismaClient } from '@prisma/client';
import { prisma as globalPrisma } from './prisma.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;

export function validateSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * Race-safe project upsert used on the agent hot path.
 * Called with global prisma + explicit orgId (not tenant client) because the
 * compound unique `where` does not reliably auto-inject orgId via the extension.
 */
export async function upsertProjectForAgent(
  orgId: string,
  slug: string,
): Promise<{ id: string; slug: string }> {
  return globalPrisma.project.upsert({
    where: { orgId_slug: { orgId, slug } },
    update: {},
    create: { orgId, slug, name: slug, status: 'ACTIVE' },
    select: { id: true, slug: true },
  });
}

/** Sync a COST_CAP_PROJECT rule materialized from `monthlyBudgetUsd`. */
export async function syncBudgetRule(
  orgId: string,
  projectId: string,
  projectName: string,
  monthlyBudgetUsd: number | null,
  db: PrismaClient,
): Promise<void> {
  // Find any existing materialized rule for this project.
  const existing = await db.rule.findFirst({
    where: {
      type: 'COST_CAP_PROJECT',
      scope: { path: ['projectId'], equals: projectId },
    },
  });

  if (monthlyBudgetUsd == null || monthlyBudgetUsd <= 0) {
    if (existing) await db.rule.delete({ where: { id: existing.id } });
    return;
  }

  if (existing) {
    await db.rule.update({
      where: { id: existing.id },
      data: {
        name: `Budget: ${projectName}`,
        condition: { maxCost: monthlyBudgetUsd, period: 'monthly' },
        enabled: true,
      },
    });
  } else {
    await db.rule.create({
      data: {
        orgId,
        name: `Budget: ${projectName}`,
        type: 'COST_CAP_PROJECT',
        scope: { projectId } as any,
        condition: { maxCost: monthlyBudgetUsd, period: 'monthly' } as any,
        action: 'ALERT',
        enabled: true,
      } as any,
    });
  }
}

/** Disable (not delete) budget rules for an archived project. */
export async function disableBudgetRule(
  projectId: string,
  db: PrismaClient,
): Promise<void> {
  await db.rule.updateMany({
    where: {
      type: 'COST_CAP_PROJECT',
      scope: { path: ['projectId'], equals: projectId },
    },
    data: { enabled: false },
  });
}
