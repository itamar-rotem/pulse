'use client';

import { useState } from 'react';
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

interface TokenFlowDataPoint {
  time: string;
  inputTokens: number;
  outputTokens: number;
}

interface TokenFlowChartProps {
  data: TokenFlowDataPoint[];
}

type TimeRange = '24h' | '7d' | '30d';

export function TokenFlowChart({ data }: TokenFlowChartProps) {
  const [range, setRange] = useState<TimeRange>('24h');

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">
          Token Flow
        </h3>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-hover)] p-0.5">
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                range === r
                  ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-sm'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.inputTokens} stopOpacity={0.2} />
              <stop offset="100%" stopColor={chartColors.inputTokens} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.outputTokens} stopOpacity={0.2} />
              <stop offset="100%" stopColor={chartColors.outputTokens} stopOpacity={0} />
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
            formatter={(value: number, name: string) => [
              formatTokens(value),
              name === 'inputTokens' ? 'Input' : 'Output',
            ]}
          />
          <Area
            type="monotone"
            dataKey="inputTokens"
            stroke={chartColors.inputTokens}
            strokeWidth={2}
            fill="url(#inputGradient)"
          />
          <Area
            type="monotone"
            dataKey="outputTokens"
            stroke={chartColors.outputTokens}
            strokeWidth={2}
            fill="url(#outputGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.inputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: chartColors.outputTokens }} />
          <span className="text-[11px] text-[var(--text-2)]">Output</span>
        </div>
      </div>
    </div>
  );
}
