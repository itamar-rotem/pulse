import { createHash } from 'crypto';
import { alertManager } from './alert-manager.js';
import type { Insight, InsightCategory } from '@pulse/shared';
import { prisma } from '../prisma.js';

function dedupKey(category: string, identifiers: Record<string, unknown>): string {
  const sorted = JSON.stringify(identifiers, Object.keys(identifiers).sort());
  const hash = createHash('sha256').update(sorted).digest('hex').slice(0, 16);
  return `${category}:${hash}`;
}

class InsightGenerator {
  /** Run all analyses. Called every 5 minutes by scheduler. */
  async analyze(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const modelOptInsights = await this.analyzeModelOptimization();
    insights.push(...modelOptInsights);

    const spendInsights = await this.analyzeSpendDistribution();
    insights.push(...spendInsights);

    const costTrendInsights = await this.analyzeCostTrends();
    insights.push(...costTrendInsights);

    return insights;
  }

  /** Detect sessions using expensive models for simple tasks */
  private async analyzeModelOptimization(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Find projects using opus-class models with low avg output
    const projectStats = await prisma.session.groupBy({
      by: ['projectSlug'],
      where: {
        model: { contains: 'opus' },
        startedAt: { gte: sevenDaysAgo },
        endedAt: { not: null },
      },
      _avg: { outputTokens: true },
      _count: { id: true },
      _sum: { costUsd: true },
      having: { id: { _count: { gte: 5 } } },
    });

    for (const stat of projectStats) {
      if (!stat._avg.outputTokens || stat._avg.outputTokens > 500) continue;

      const estimatedSavings = (stat._sum.costUsd ?? 0) * 0.6; // Sonnet is ~60% cheaper
      const key = dedupKey('COST_OPTIMIZATION', { projectName: stat.projectSlug, suggestion: 'downgrade_model' });

      const existing = await prisma.insight.findFirst({
        where: {
          dedupKey: key,
          status: 'ACTIVE',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const insight = await prisma.insight.create({
        data: {
          category: 'COST_OPTIMIZATION',
          title: `Switch "${stat.projectSlug}" to Sonnet`,
          description: `${stat._count.id} Opus sessions in the last 7 days averaged only ${Math.round(stat._avg.outputTokens)} output tokens. Sonnet can handle this workload at ~60% lower cost.`,
          impact: { estimatedSavings: Math.round(estimatedSavings * 100) / 100, confidence: 0.8 },
          metadata: {
            projectName: stat.projectSlug,
            sessionCount: stat._count.id,
            avgOutputTokens: Math.round(stat._avg.outputTokens),
            suggestedRule: {
              type: 'MODEL_RESTRICTION',
              scope: { projectName: stat.projectSlug },
              condition: { allowedModels: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
              action: 'BLOCK',
            },
          },
          dedupKey: key,
        },
      });

      insights.push(insight as unknown as Insight);
    }

    return insights;
  }

  /** Detect dominant project spending */
  private async analyzeSpendDistribution(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const projectSpend = await prisma.session.groupBy({
      by: ['projectSlug'],
      where: { startedAt: { gte: sevenDaysAgo } },
      _sum: { costUsd: true },
    });

    const totalSpend = projectSpend.reduce((acc, p) => acc + (p._sum.costUsd ?? 0), 0);
    if (totalSpend === 0) return insights;

    for (const project of projectSpend) {
      const cost = project._sum.costUsd ?? 0;
      const percentage = cost / totalSpend;
      if (percentage < 0.5) continue; // Only flag >50% concentration

      const key = dedupKey('USAGE_PATTERN', { topProject: project.projectSlug });
      const existing = await prisma.insight.findFirst({
        where: {
          dedupKey: key,
          status: 'ACTIVE',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      const insight = await prisma.insight.create({
        data: {
          category: 'USAGE_PATTERN',
          title: `"${project.projectSlug}" accounts for ${Math.round(percentage * 100)}% of spend`,
          description: `In the last 7 days, "${project.projectSlug}" cost $${cost.toFixed(2)} out of $${totalSpend.toFixed(2)} total. Consider setting a project cost cap.`,
          impact: { percentChange: Math.round(percentage * 100) },
          metadata: { projectName: project.projectSlug, cost, totalSpend, percentage },
          dedupKey: key,
        },
      });

      insights.push(insight as unknown as Insight);
    }

    return insights;
  }

  /** Detect week-over-week cost trend changes */
  private async analyzeCostTrends(): Promise<Insight[]> {
    const insights: Insight[] = [];

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const [thisWeek, lastWeek] = await Promise.all([
      prisma.session.aggregate({
        where: { startedAt: { gte: thisWeekStart } },
        _avg: { costUsd: true },
        _count: true,
      }),
      prisma.session.aggregate({
        where: { startedAt: { gte: lastWeekStart, lt: thisWeekStart } },
        _avg: { costUsd: true },
        _count: true,
      }),
    ]);

    const thisAvg = thisWeek._avg.costUsd ?? 0;
    const lastAvg = lastWeek._avg.costUsd ?? 0;

    if (lastAvg > 0 && thisAvg > 0) {
      const change = (thisAvg - lastAvg) / lastAvg;
      if (change >= 0.25) {
        const key = dedupKey('USAGE_PATTERN', { trend: 'cost_increase_weekly' });
        const existing = await prisma.insight.findFirst({
          where: {
            dedupKey: key,
            status: 'ACTIVE',
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          const insight = await prisma.insight.create({
            data: {
              category: 'USAGE_PATTERN',
              title: `Avg session cost up ${Math.round(change * 100)}% this week`,
              description: `Average session cost increased from $${lastAvg.toFixed(2)} to $${thisAvg.toFixed(2)} week-over-week.`,
              impact: { percentChange: Math.round(change * 100) },
              metadata: { thisWeekAvg: thisAvg, lastWeekAvg: lastAvg },
              dedupKey: key,
            },
          });
          insights.push(insight as unknown as Insight);
        }
      }
    }

    return insights;
  }

  /** Weekly digest — called by scheduler on Sunday */
  async weeklyDigest(): Promise<Insight | null> {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const [stats, alertCount] = await Promise.all([
      prisma.session.aggregate({
        where: { startedAt: { gte: weekStart } },
        _sum: { costUsd: true },
        _count: true,
      }),
      prisma.alert.count({
        where: { createdAt: { gte: weekStart } },
      }),
    ]);

    const sessionCount = stats._count;
    const totalCost = stats._sum.costUsd ?? 0;

    const key = dedupKey('PLAN_RECOMMENDATION', { type: 'weekly_digest', week: weekStart.toISOString().slice(0, 10) });

    const insight = await prisma.insight.create({
      data: {
        category: 'PLAN_RECOMMENDATION',
        title: `Weekly digest: ${sessionCount} sessions, $${totalCost.toFixed(0)} spent`,
        description: `This week: ${sessionCount} sessions totaling $${totalCost.toFixed(2)}. ${alertCount} alerts generated.`,
        impact: {},
        metadata: { sessionCount, totalCost, alertCount, weekStart: weekStart.toISOString() },
        dedupKey: key,
      },
    });

    // Also create an alert for the digest
    await alertManager.create({
      type: 'INSIGHT',
      severity: 'INFO',
      title: insight.title,
      message: insight.description,
      insightId: insight.id,
    });

    return insight as unknown as Insight;
  }

  /** Apply an insight — creates associated rule if applicable */
  async applyInsight(insightId: string): Promise<{ insight: Insight; ruleId?: string }> {
    const insight = await prisma.insight.findUnique({ where: { id: insightId } });
    if (!insight) throw new Error('Insight not found');

    let ruleId: string | undefined;

    // Auto-create rule if insight has suggestedRule metadata
    const metadata = insight.metadata as Record<string, unknown>;
    if (insight.category === 'COST_OPTIMIZATION' && metadata.suggestedRule) {
      const suggested = metadata.suggestedRule as Record<string, unknown>;
      const rule = await prisma.rule.create({
        data: {
          name: `Auto: ${insight.title}`,
          type: suggested.type as string,
          scope: suggested.scope as object,
          condition: suggested.condition as object,
          action: suggested.action as string,
        } as any,
      });
      ruleId = rule.id;
    }

    const updated = await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });

    return { insight: updated as unknown as Insight, ruleId };
  }
}

export const insightGenerator = new InsightGenerator();
