'use client';

import { RingGauge } from '@/components/ui/ring-gauge';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { formatTokens, formatCost, formatDuration, getBurnRateStatus } from '@/lib/format';
import { colors } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  sessionId: string;
  projectSlug: string;
  model: string;
  sessionType: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  startedAt?: string;
}

const BASELINE_BURN_RATE = 1000;
const RING_MAX = 3000;

const borderColorMap = {
  healthy: 'border-[var(--green-border)]',
  warning: 'border-[var(--amber-border)]',
  hot: 'border-[var(--red-border)]',
};

const ringColorMap = {
  healthy: colors.green,
  warning: colors.amber,
  hot: colors.red,
};

export function SessionCard({
  projectSlug,
  model,
  sessionType,
  cumulativeInputTokens,
  cumulativeOutputTokens,
  cumulativeCostUsd,
  burnRatePerMin,
  startedAt,
}: SessionCardProps) {
  const status = getBurnRateStatus(burnRatePerMin, BASELINE_BURN_RATE);

  return (
    <div
      className={cn(
        'rounded-[20px] border-2 bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors',
        borderColorMap[status],
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <StatusDot variant={status === 'healthy' ? 'green' : status === 'warning' ? 'amber' : 'red'} pulse />
        <span className="text-[13px] font-semibold text-[var(--text-1)] truncate flex-1">
          {projectSlug}
        </span>
        <StatTag variant="neutral">{model}</StatTag>
      </div>

      <div className="flex items-center justify-center mb-4">
        <RingGauge
          value={burnRatePerMin}
          max={RING_MAX}
          size={90}
          strokeWidth={7}
          color={ringColorMap[status]}
        >
          <div className="text-center">
            <p className="text-sm font-bold font-mono text-[var(--text-1)]">
              {formatTokens(burnRatePerMin)}
            </p>
            <p className="text-[9px] text-[var(--text-3)]">tok/min</p>
          </div>
        </RingGauge>
      </div>

      <div className="space-y-2 text-[12px]">
        <div className="flex justify-between">
          <span className="text-[var(--text-2)]">Cost</span>
          <span className="font-mono font-semibold text-[var(--text-1)]">
            {formatCost(cumulativeCostUsd)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-2)]">Tokens</span>
          <span className="font-mono text-[var(--text-1)]">
            {formatTokens(cumulativeInputTokens + cumulativeOutputTokens)}
          </span>
        </div>
        {startedAt && (
          <div className="flex justify-between">
            <span className="text-[var(--text-2)]">Duration</span>
            <span className="font-mono text-[var(--text-1)]">
              {formatDuration(startedAt)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
        <StatTag variant={sessionType === 'human' ? 'blue' : 'purple'}>
          {sessionType}
        </StatTag>
      </div>
    </div>
  );
}
