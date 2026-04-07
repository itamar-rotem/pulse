import { createHash } from 'crypto';
import { alertManager } from './alert-manager.js';
import type { Insight, InsightCategory } from '@pulse/shared';
import { prisma } from '../prisma.js';
import type { RuleType, RuleAction } from '@prisma/client';

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

    const peakInsights = await this.analyzePeakUsage();
    insights.push(...peakInsights);

    const planInsights = await this.analyzePlanRecommendation();
    insights.push(...planInsights);

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

  /** Detect peak usage concentration in a narrow time window */
  private async analyzePeakUsage(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const sessions = await prisma.session.findMany({
      where: { startedAt: { gte: sevenDaysAgo } },
      select: { startedAt: true, costUsd: true },
    });

    if (sessions.length < 10) return insights; // Need enough data

    // Bucket costs by hour-of-day (0-23)
    const hourBuckets = new Array(24).fill(0);
    let totalCost = 0;
    for (const s of sessions) {
      const hour = new Date(s.startedAt).getUTCHours();
      hourBuckets[hour] += s.costUsd;
      totalCost += s.costUsd;
    }

    if (totalCost === 0) return insights;

    // Find the peak 4-hour window
    let maxWindowCost = 0;
    let peakStart = 0;
    for (let start = 0; start < 24; start++) {
      let windowCost = 0;
      for (let i = 0; i < 4; i++) {
        windowCost += hourBuckets[(start + i) % 24];
      }
      if (windowCost > maxWindowCost) {
        maxWindowCost = windowCost;
        peakStart = start;
      }
    }

    const concentration = maxWindowCost / totalCost;
    if (concentration < 0.6) return insights; // Only flag >60%

    const peakEnd = (peakStart + 4) % 24;
    const key = dedupKey('USAGE_PATTERN', { type: 'peak_usage', peakStart });

    const existing = await prisma.insight.findFirst({
      where: {
        dedupKey: key,
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return insights;

    const insight = await prisma.insight.create({
      data: {
        category: 'USAGE_PATTERN',
        title: `Peak usage ${peakStart}:00-${peakEnd}:00 UTC (${Math.round(concentration * 100)}% of spend)`,
        description: `${Math.round(concentration * 100)}% of your 7-day spend is concentrated in a 4-hour window. Consider scheduling batch agent work outside this window.`,
        impact: { percentChange: Math.round(concentration * 100) },
        metadata: { peakStart, peakEnd, concentration, totalCost },
        dedupKey: key,
      },
    });

    insights.push(insight as unknown as Insight);
    return insights;
  }

  /** Suggest plan upgrade/downgrade based on actual spend */
  private async analyzePlanRecommendation(): Promise<Insight[]> {
    const insights: Insight[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.session.aggregate({
      where: { startedAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true },
    });

    const monthlySpend = result._sum.costUsd ?? 0;
    if (monthlySpend === 0) return insights;

    // Plan tiers (simplified)
    const planCost = 100; // Current Max Plan
    const valueRatio = monthlySpend / planCost;

    let title: string | null = null;
    let description: string | null = null;

    if (valueRatio > 5) {
      title = `Getting ${valueRatio.toFixed(0)}x value from your plan`;
      description = `Your 30-day API spend of $${monthlySpend.toFixed(0)} represents ${valueRatio.toFixed(0)}x the value of your $${planCost}/mo plan. Great ROI!`;
    } else if (monthlySpend < planCost * 0.3) {
      title = `Low plan utilization ($${monthlySpend.toFixed(0)}/$${planCost} this month)`;
      description = `Your 30-day spend of $${monthlySpend.toFixed(0)} is only ${Math.round((monthlySpend / planCost) * 100)}% of your plan cost. Consider whether a lower tier would suffice.`;
    }

    if (!title) return insights;

    const key = dedupKey('PLAN_RECOMMENDATION', { type: 'plan_utilization', month: new Date().toISOString().slice(0, 7) });

    const existing = await prisma.insight.findFirst({
      where: {
        dedupKey: key,
        status: 'ACTIVE',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 7-day dedup window
      },
    });
    if (existing) return insights;

    const insight = await prisma.insight.create({
      data: {
        category: 'PLAN_RECOMMENDATION',
        title,
        description: description!,
        impact: { percentChange: Math.round(valueRatio * 100) },
        metadata: { monthlySpend, planCost, valueRatio },
        dedupKey: key,
      },
    });

    insights.push(insight as unknown as Insight);
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

      // Validate required fields
      const type = suggested.type as RuleType | undefined;
      const scope = suggested.scope as object | undefined;
      const condition = suggested.condition as object | undefined;
      const action = suggested.action as RuleAction | undefined;

      if (!type || !scope || !condition || !action) {
        throw new Error('suggestedRule metadata is missing required fields (type, scope, condition, action)');
      }

      const rule = await prisma.rule.create({
        data: {
          name: `Auto: ${insight.title}`,
          type,
          scope,
          condition,
          action,
        },
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
