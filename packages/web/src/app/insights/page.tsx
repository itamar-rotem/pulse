'use client';

import { useState } from 'react';
import { Lightbulb, BarChart3, Zap, DollarSign, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useInsights, dismissInsight, applyInsight } from '@/hooks/use-intelligence';
import { formatRelativeTime, formatCost } from '@/lib/format';
import type { InsightCategory, InsightStatus } from '@pulse/shared';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_CONFIG: Record<InsightCategory, { icon: LucideIcon; label: string; variant: 'green' | 'blue' | 'amber' | 'purple' }> = {
  COST_OPTIMIZATION: { icon: DollarSign, label: 'Cost Optimization', variant: 'green' },
  USAGE_PATTERN: { icon: BarChart3, label: 'Usage Pattern', variant: 'blue' },
  ANOMALY_TREND: { icon: Zap, label: 'Anomaly Trend', variant: 'amber' },
  PLAN_RECOMMENDATION: { icon: Lightbulb, label: 'Plan', variant: 'purple' },
};

export default function InsightsPage() {
  const { connected } = useWebSocket(() => {});
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<InsightStatus | ''>('ACTIVE');
  const { data, mutate } = useInsights({
    category: categoryFilter || undefined,
    status: statusFilter || undefined,
    limit: 50,
  });

  const insights = data?.insights ?? [];

  async function handleDismiss(id: string) {
    await dismissInsight(id);
    mutate();
  }

  async function handleApply(id: string) {
    await applyInsight(id);
    mutate();
  }

  return (
    <div>
      <PageHeader title="Insights" subtitle="AI-powered recommendations based on your usage patterns" connected={connected} />

      <div className="px-8 py-6 max-w-5xl">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as InsightCategory | '')}
          >
            <option value="">All Categories</option>
            <option value="COST_OPTIMIZATION">Cost Optimization</option>
            <option value="USAGE_PATTERN">Usage Pattern</option>
            <option value="ANOMALY_TREND">Anomaly Trend</option>
            <option value="PLAN_RECOMMENDATION">Plan</option>
          </select>

          <select
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InsightStatus | '')}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="APPLIED">Applied</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>

        {/* Insight cards */}
        <div className="mt-4 space-y-3">
          {insights.length === 0 && (
            <div className="text-center py-16 text-[var(--text-3)]">
              <Lightbulb size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-[15px] font-medium">No insights yet</p>
              <p className="text-[13px] mt-1">Pulse is analyzing your usage patterns. Insights will appear here.</p>
            </div>
          )}

          {insights.map((insight) => {
            const config = CATEGORY_CONFIG[insight.category];
            const Icon = config.icon;
            const impact = insight.impact as Record<string, unknown>;

            return (
              <div
                key={insight.id}
                className={`rounded-[16px] border bg-[var(--surface)] overflow-hidden transition-colors ${
                  insight.status === 'ACTIVE'
                    ? 'border-[var(--border)]'
                    : 'border-[var(--border)] opacity-60'
                }`}
              >
                <div className="flex">
                  {/* Left accent bar */}
                  <div
                    className="w-1 shrink-0"
                    style={{ background: 'linear-gradient(to bottom, var(--accent), var(--accent-dark))' }}
                  />

                  <div className="flex-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatTag variant={config.variant}>{config.label}</StatTag>
                          {!!impact.estimatedSavings && (
                            <StatTag variant="green">Save {formatCost(impact.estimatedSavings as number)}/wk</StatTag>
                          )}
                          {!!impact.percentChange && (
                            <StatTag variant="amber">{impact.percentChange as number}% change</StatTag>
                          )}
                          <span className="text-[11px] text-[var(--text-3)]">
                            {formatRelativeTime(insight.createdAt)}
                          </span>
                        </div>

                        <p className="text-[14px] font-semibold text-[var(--text-1)]">{insight.title}</p>
                        <p className="text-[13px] text-[var(--text-2)] mt-0.5">{insight.description}</p>

                        {insight.status === 'ACTIVE' && (
                          <div className="flex items-center gap-2 mt-3">
                            {!!(insight.metadata as Record<string, unknown>).suggestedRule && (
                              <button
                                onClick={() => handleApply(insight.id)}
                                className="inline-flex items-center gap-1.5 rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-3 py-1.5 text-[12px] font-semibold text-white"
                              >
                                <Check size={12} /> Apply
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(insight.id)}
                              className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-hover)]"
                            >
                              <X size={12} /> Dismiss
                            </button>
                          </div>
                        )}

                        {insight.status === 'APPLIED' && (
                          <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[var(--green)] font-medium">
                            <Check size={12} /> Applied {insight.appliedAt ? formatRelativeTime(insight.appliedAt) : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
