'use client';

import { useState, Suspense } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Download, TrendingUp, PieChart, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatCost, formatTokens } from '@/lib/format';
import {
  useCostTrends,
  useBreakdown,
  useBudgetStatus,
  getExportUrl,
} from '@/hooks/use-analytics';
import { useProjects } from '@/hooks/use-projects';

type Granularity = 'day' | 'week' | 'month';
type GroupBy = 'project' | 'model' | 'sessionType' | 'user';
type Days = 7 | 30 | 90;

const BAR_COLORS = [colors.accent, colors.blue, colors.purple, colors.green, colors.amber, colors.red];

function AnalyticsContent() {
  const [days, setDays] = useState<Days>(30);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [projectId, setProjectId] = useState<string>('');

  const { data: trendsData } = useCostTrends({ granularity, days, projectId: projectId || undefined });
  const { data: breakdownData } = useBreakdown({ groupBy, days, projectId: projectId || undefined });
  const { data: budgetData } = useBudgetStatus();
  const { data: projectsData } = useProjects();

  const trends = trendsData?.trends ?? [];
  const breakdown = breakdownData?.breakdown ?? [];
  const budgetItems = budgetData?.items ?? [];
  const projects = projectsData?.projects ?? [];

  // Summary stats from trends
  const totalCost = trends.reduce((sum, t) => sum + t.cost, 0);
  const totalSessions = trends.reduce((sum, t) => sum + t.sessions, 0);
  const totalInputTokens = trends.reduce((sum, t) => sum + t.inputTokens, 0);
  const totalOutputTokens = trends.reduce((sum, t) => sum + t.outputTokens, 0);
  const avgDailyCost = days > 0 ? totalCost / days : 0;

  return (
    <div>
      <PageHeader title="Analytics" subtitle={`${days}-day overview across ${projects.length} projects`}>
        {/* Project filter */}
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="text-[13px] px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Export */}
        <a
          href={getExportUrl({ days, projectId: projectId || undefined })}
          download
          className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-1)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          <Download size={14} />
          Export CSV
        </a>
      </PageHeader>

      <div className="p-8 space-y-6">
        {/* Summary stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label={`Total Spend (${days}d)`} value={formatCost(totalCost)} inverted />
          <StatCard label="Avg Daily Cost" value={formatCost(avgDailyCost)} />
          <StatCard label="Total Sessions" value={totalSessions.toLocaleString()} />
          <StatCard label="Tokens Processed" value={formatTokens(totalInputTokens + totalOutputTokens)} />
        </div>

        {/* Cost Trends Chart */}
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[var(--text-2)]" />
              <h3 className="text-sm font-semibold text-[var(--text-1)]">Cost Trends</h3>
            </div>
            <div className="flex gap-2">
              {/* Days selector */}
              <div className="flex gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
                {([7, 30, 90] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      days === d
                        ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              {/* Granularity selector */}
              <div className="flex gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
                {(['day', 'week', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      granularity === g
                        ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trends} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.cost} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={chartColors.cost} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="date"
                fontSize={11}
                tick={{ fill: chartColors.axis }}
                axisLine={{ stroke: chartColors.grid }}
                tickLine={false}
                tickFormatter={(v: string) => {
                  if (granularity === 'month') return v;
                  return v.slice(5); // MM-DD
                }}
              />
              <YAxis
                fontSize={11}
                tick={{ fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatCost(v)}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  name === 'cost' ? formatCost(value) : value.toLocaleString(),
                  name === 'cost' ? 'Cost' : 'Sessions',
                ]}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke={chartColors.cost}
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown + Budget side by side */}
        <div className="grid grid-cols-2 gap-6">
          {/* Breakdown */}
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart size={16} className="text-[var(--text-2)]" />
                <h3 className="text-sm font-semibold text-[var(--text-1)]">Cost Breakdown</h3>
              </div>
              <div className="flex gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
                {([
                  { value: 'project' as const, label: 'Project' },
                  { value: 'model' as const, label: 'Model' },
                  { value: 'sessionType' as const, label: 'Type' },
                  { value: 'user' as const, label: 'User' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGroupBy(opt.value)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                      groupBy === opt.value
                        ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={breakdown.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis
                  type="number"
                  fontSize={11}
                  tick={{ fill: chartColors.axis }}
                  tickFormatter={(v: number) => formatCost(v)}
                />
                <YAxis
                  type="category"
                  dataKey="key"
                  width={100}
                  fontSize={11}
                  tick={{ fill: colors.text1 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${colors.border}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [formatCost(value), 'Cost']}
                />
                <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                  {breakdown.slice(0, 8).map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Percentage table below chart */}
            {breakdown.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {breakdown.slice(0, 6).map((item, idx) => (
                  <div key={item.key} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: BAR_COLORS[idx % BAR_COLORS.length] }} />
                      <span className="text-[var(--text-1)] font-medium truncate max-w-[120px]">{item.key}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--text-2)]">
                      <span>{formatCost(item.cost)}</span>
                      <span className="w-10 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Budget Status */}
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} className="text-[var(--text-2)]" />
              <h3 className="text-sm font-semibold text-[var(--text-1)]">Budget Status</h3>
            </div>

            {budgetItems.length === 0 ? (
              <p className="text-[13px] text-[var(--text-2)] mt-8 text-center">
                No active projects yet.
              </p>
            ) : (
              <div className="space-y-3">
                {budgetItems.map((item) => (
                  <div key={item.projectId} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[var(--text-1)]">
                        {item.projectName}
                      </span>
                      <span className="text-[12px] text-[var(--text-2)]">
                        {formatCost(item.actualCostUsd)}
                        {item.monthlyBudgetUsd != null && ` / ${formatCost(item.monthlyBudgetUsd)}`}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, item.percentUsed ?? (item.monthlyBudgetUsd ? 0 : 50))}%`,
                          background:
                            item.percentUsed != null && item.percentUsed > 90
                              ? colors.red
                              : item.percentUsed != null && item.percentUsed > 70
                                ? colors.amber
                                : colors.accent,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
                      <span>{item.sessionsThisMonth} sessions this month</span>
                      {item.percentUsed != null && (
                        <span className={item.percentUsed > 90 ? 'text-[var(--red)] font-medium' : ''}>
                          {item.percentUsed}% used
                        </span>
                      )}
                      {item.monthlyBudgetUsd == null && (
                        <span className="italic">No budget set</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--text-2)]">Loading analytics...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
