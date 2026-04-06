import { StatCard } from '@/components/ui/stat-card';
import { StatTag } from '@/components/ui/stat-tag';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { formatTokens, formatCost } from '@/lib/format';

interface TodaySummaryProps {
  totalCost: number;
  humanCost: number;
  agentCost: number;
  humanSessions: number;
  agentSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

export function TodaySummary({
  totalCost,
  humanSessions,
  agentSessions,
  totalInputTokens,
  totalOutputTokens,
  totalCacheCreationTokens,
  totalCacheReadTokens,
}: TodaySummaryProps) {
  const totalSessions = humanSessions + agentSessions;
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCache = totalCacheReadTokens + totalCacheCreationTokens;
  const cacheEfficiency =
    totalTokens > 0
      ? Math.round((totalCacheReadTokens / (totalTokens + totalCache)) * 100)
      : 0;
  const valueRatio = totalCost > 0 ? Math.round(totalCost / 100) : 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="Sessions Today" value={String(totalSessions)}>
        <div className="flex gap-1.5">
          <StatTag variant="blue">{humanSessions} human</StatTag>
          <StatTag variant="purple">{agentSessions} agent</StatTag>
        </div>
      </StatCard>

      <StatCard label="Tokens Generated" value={formatTokens(totalTokens)}>
        <div className="flex gap-1.5">
          <StatTag variant="blue">{formatTokens(totalInputTokens)} in</StatTag>
          <StatTag variant="purple">{formatTokens(totalOutputTokens)} out</StatTag>
        </div>
      </StatCard>

      <StatCard label="Cache Efficiency" value={`${cacheEfficiency}%`}>
        <Progress value={cacheEfficiency} className="mt-1">
          <ProgressTrack className="h-1.5 bg-[var(--border)]">
            <ProgressIndicator className="bg-[var(--green)]" />
          </ProgressTrack>
        </Progress>
        <div className="flex gap-1.5 mt-1.5">
          <StatTag variant="green">
            {formatTokens(totalCacheReadTokens)} read
          </StatTag>
        </div>
      </StatCard>

      <StatCard
        label="API-Equivalent Value"
        value={formatCost(totalCost)}
        inverted
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/50">$100/mo plan</span>
          <span className="font-mono font-bold text-[var(--green)]">
            {valueRatio}x ROI
          </span>
        </div>
      </StatCard>
    </div>
  );
}
