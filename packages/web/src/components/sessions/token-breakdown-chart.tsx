'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatTokens } from '@/lib/format';

interface TokenBreakdownChartProps {
  data: Array<{
    time: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }>;
}

export function TokenBreakdownChart({ data }: TokenBreakdownChartProps) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        Token Breakdown
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.inputTokens} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.inputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.outputTokens} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.outputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cacheReadGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.cacheRead} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.cacheRead} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cacheCreateGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.cacheCreation} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.cacheCreation} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="time"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={{ stroke: chartColors.grid }}
            tickLine={false}
          />
          <YAxis
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatTokens(v)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(value: number) => [formatTokens(value)]}
          />
          <Area type="monotone" dataKey="inputTokens" stackId="1" stroke={chartColors.inputTokens} strokeWidth={1.5} fill="url(#inputGrad)" />
          <Area type="monotone" dataKey="outputTokens" stackId="1" stroke={chartColors.outputTokens} strokeWidth={1.5} fill="url(#outputGrad)" />
          <Area type="monotone" dataKey="cacheReadTokens" stackId="1" stroke={chartColors.cacheRead} strokeWidth={1.5} fill="url(#cacheReadGrad)" />
          <Area type="monotone" dataKey="cacheCreationTokens" stackId="1" stroke={chartColors.cacheCreation} strokeWidth={1.5} fill="url(#cacheCreateGrad)" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.inputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.outputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Output</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.cacheRead }} />
          <span className="text-[11px] text-[var(--text-2)]">Cache Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.cacheCreation }} />
          <span className="text-[11px] text-[var(--text-2)]">Cache Creation</span>
        </div>
      </div>
    </div>
  );
}
