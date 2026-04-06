'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors, colors } from '@/lib/design-tokens';
import { formatCost } from '@/lib/format';

interface CostChartProps {
  data: Array<{
    time: string;
    cost: number;
    burnRate: number;
  }>;
}

export function CostChart({ data }: CostChartProps) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        Cost Over Time
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="time"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={{ stroke: chartColors.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="cost"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCost(v)}
          />
          <YAxis
            yAxisId="burnRate"
            orientation="right"
            fontSize={11}
            tick={{ fill: chartColors.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              name === 'cost' ? formatCost(value) : `${value.toFixed(0)} tok/min`,
              name === 'cost' ? 'Cumulative Cost' : 'Burn Rate',
            ]}
          />
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="cost"
            stroke={chartColors.cost}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="burnRate"
            type="monotone"
            dataKey="burnRate"
            stroke={chartColors.burnRate}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full" style={{ background: chartColors.cost }} />
          <span className="text-[11px] text-[var(--text-2)]">Cost</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded-full border-b border-dashed" style={{ borderColor: chartColors.burnRate }} />
          <span className="text-[11px] text-[var(--text-2)]">Burn Rate</span>
        </div>
      </div>
    </div>
  );
}
