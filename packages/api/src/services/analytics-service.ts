import type { PrismaClient } from '@prisma/client';

interface CostTrendPoint {
  date: string;
  cost: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
}

interface BreakdownItem {
  key: string;
  cost: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  percentage: number;
}

interface BudgetStatusItem {
  projectId: string;
  projectName: string;
  projectSlug: string;
  monthlyBudgetUsd: number | null;
  actualCostUsd: number;
  sessionsThisMonth: number;
  percentUsed: number | null;
}

export interface CostTrendsParams {
  granularity: 'day' | 'week' | 'month';
  days: number;
  projectId?: string;
}

export interface BreakdownParams {
  groupBy: 'project' | 'model' | 'sessionType';
  days: number;
  projectId?: string;
}

/**
 * Cost trend time series. Groups sessions by date bucket and returns
 * cost + token totals per bucket.
 *
 * Uses raw SQL for date_trunc grouping since Prisma doesn't support
 * it natively. Falls back to in-memory bucketing if raw queries fail.
 */
export async function getCostTrends(
  db: PrismaClient,
  params: CostTrendsParams,
): Promise<CostTrendPoint[]> {
  const since = new Date(Date.now() - params.days * 86400000);

  const where: Record<string, unknown> = {
    startedAt: { gte: since },
  };
  if (params.projectId) where.projectId = params.projectId;

  const sessions = await (db as any).session.findMany({
    where,
    select: {
      startedAt: true,
      costUsd: true,
      inputTokens: true,
      outputTokens: true,
    },
    orderBy: { startedAt: 'asc' },
  });

  // Bucket in-memory by date. Efficient enough for the typical scale
  // (thousands of sessions, not millions).
  const buckets = new Map<string, CostTrendPoint>();

  for (const s of sessions) {
    const d = new Date(s.startedAt);
    let key: string;
    if (params.granularity === 'month') {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    } else if (params.granularity === 'week') {
      // ISO week: use Monday of the week
      const day = d.getUTCDay();
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      key = monday.toISOString().slice(0, 10);
    } else {
      key = d.toISOString().slice(0, 10);
    }

    const existing = buckets.get(key) ?? {
      date: key,
      cost: 0,
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    existing.cost += s.costUsd;
    existing.sessions += 1;
    existing.inputTokens += s.inputTokens;
    existing.outputTokens += s.outputTokens;
    buckets.set(key, existing);
  }

  // Fill gaps for day granularity so the chart has continuous x-axis
  if (params.granularity === 'day') {
    const cursor = new Date(since);
    cursor.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      if (!buckets.has(key)) {
        buckets.set(key, { date: key, cost: 0, sessions: 0, inputTokens: 0, outputTokens: 0 });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Cost breakdown grouped by project, model, or session type.
 */
export async function getCostBreakdown(
  db: PrismaClient,
  params: BreakdownParams,
): Promise<BreakdownItem[]> {
  const since = new Date(Date.now() - params.days * 86400000);

  const where: Record<string, unknown> = {
    startedAt: { gte: since },
  };
  if (params.projectId) where.projectId = params.projectId;

  const groupByField =
    params.groupBy === 'project'
      ? 'projectId'
      : params.groupBy === 'model'
        ? 'model'
        : 'sessionType';

  const sessions = await (db as any).session.findMany({
    where,
    select: {
      [groupByField]: true,
      costUsd: true,
      inputTokens: true,
      outputTokens: true,
      ...(params.groupBy === 'project' ? { project: { select: { name: true, slug: true } } } : {}),
    },
  });

  const groups = new Map<string, BreakdownItem & { _label?: string }>();
  let totalCost = 0;

  for (const s of sessions) {
    const rawKey = s[groupByField] as string;
    const key = rawKey ?? 'unknown';
    const existing = groups.get(key) ?? {
      key,
      cost: 0,
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      percentage: 0,
    };
    existing.cost += s.costUsd;
    existing.sessions += 1;
    existing.inputTokens += s.inputTokens;
    existing.outputTokens += s.outputTokens;
    // For project grouping, store the display name
    if (params.groupBy === 'project' && s.project) {
      (existing as any)._label = s.project.name || s.project.slug;
    }
    totalCost += s.costUsd;
    groups.set(key, existing);
  }

  const items = Array.from(groups.values())
    .map((g) => ({
      key: (g as any)._label || g.key,
      cost: Math.round(g.cost * 100) / 100,
      sessions: g.sessions,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      percentage: totalCost > 0 ? Math.round((g.cost / totalCost) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  return items;
}

/**
 * Budget status for all projects with a monthly budget.
 */
export async function getBudgetStatus(db: PrismaClient): Promise<BudgetStatusItem[]> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const projects = await (db as any).project.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      monthlyBudgetUsd: true,
    },
  });

  const results: BudgetStatusItem[] = [];

  for (const project of projects) {
    const agg = await (db as any).session.aggregate({
      where: {
        projectId: project.id,
        startedAt: { gte: monthStart },
      },
      _sum: { costUsd: true },
      _count: true,
    });

    const actualCost = agg._sum.costUsd ?? 0;
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      monthlyBudgetUsd: project.monthlyBudgetUsd,
      actualCostUsd: Math.round(actualCost * 100) / 100,
      sessionsThisMonth: agg._count,
      percentUsed:
        typeof project.monthlyBudgetUsd === 'number' && project.monthlyBudgetUsd > 0
          ? Math.round((actualCost / project.monthlyBudgetUsd) * 1000) / 10
          : null,
    });
  }

  return results.sort((a, b) => b.actualCostUsd - a.actualCostUsd);
}

/**
 * Returns sessions as flat objects for CSV export.
 */
export async function getSessionsForExport(
  db: PrismaClient,
  params: { days: number; projectId?: string },
): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - params.days * 86400000);

  const where: Record<string, unknown> = {
    startedAt: { gte: since },
  };
  if (params.projectId) where.projectId = params.projectId;

  const sessions = await (db as any).session.findMany({
    where,
    select: {
      id: true,
      tool: true,
      model: true,
      sessionType: true,
      status: true,
      startedAt: true,
      endedAt: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      costUsd: true,
      projectSlug: true,
      project: { select: { name: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 10000, // Safety cap
  });

  return sessions.map((s: any) => ({
    id: s.id,
    project: s.project?.name ?? s.projectSlug,
    tool: s.tool,
    model: s.model,
    type: s.sessionType,
    status: s.status,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    input_tokens: s.inputTokens,
    output_tokens: s.outputTokens,
    cache_creation_tokens: s.cacheCreationTokens,
    cache_read_tokens: s.cacheReadTokens,
    cost_usd: s.costUsd,
  }));
}
