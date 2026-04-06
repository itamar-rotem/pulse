'use client';

import { StatCard } from '@/components/ui/stat-card';
import { StatTag } from '@/components/ui/stat-tag';
import { CostChart } from './cost-chart';
import { TokenBreakdownChart } from './token-breakdown-chart';
import { formatTokens, formatCost, formatDuration } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TokenEvent {
  timestamp: string;
  cumulativeCostUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  burnRatePerMin: number;
}

interface SessionDetailProps {
  session: {
    id: string;
    tool: string;
    projectSlug: string;
    sessionType: string;
    model: string;
    startedAt: string;
    endedAt: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    tokenEvents: TokenEvent[];
  };
}

export function SessionDetail({ session }: SessionDetailProps) {
  const duration = formatDuration(session.startedAt, session.endedAt);
  const totalTokens = session.inputTokens + session.outputTokens;

  const costChartData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cost: e.cumulativeCostUsd,
    burnRate: e.burnRatePerMin,
  }));

  const tokenBreakdownData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    inputTokens: e.cumulativeInputTokens,
    outputTokens: e.cumulativeOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-[var(--text-1)]">
          {session.projectSlug}
        </h2>
        <StatTag variant={session.sessionType === 'human' ? 'blue' : 'purple'}>
          {session.sessionType}
        </StatTag>
        <StatTag variant="neutral">{session.model}</StatTag>
        <span className="text-[12px] text-[var(--text-2)]">
          Started {new Date(session.startedAt).toLocaleString()}
        </span>
        <StatTag variant={session.endedAt ? 'neutral' : 'green'}>
          {session.endedAt ? 'Ended' : 'Active'}
        </StatTag>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Duration" value={duration} />
        <StatCard label="Total Tokens" value={formatTokens(totalTokens)}>
          <div className="flex gap-1.5">
            <StatTag variant="blue">{formatTokens(session.inputTokens)} in</StatTag>
            <StatTag variant="purple">{formatTokens(session.outputTokens)} out</StatTag>
          </div>
        </StatCard>
        <StatCard label="Total Value" value={formatCost(session.costUsd)} inverted />
      </div>

      {costChartData.length > 1 && (
        <div className="grid grid-cols-2 gap-6">
          <CostChart data={costChartData} />
          <TokenBreakdownChart data={tokenBreakdownData} />
        </div>
      )}

      {session.tokenEvents.length > 0 && (
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="px-5 py-3 border-b border-[var(--border-light)]">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">
              Token Events
            </h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Burn Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.tokenEvents.map((event, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[12px] font-mono text-[var(--text-2)]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.cumulativeInputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.cumulativeOutputTokens)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatCost(event.cumulativeCostUsd)}
                    </TableCell>
                    <TableCell className="text-right text-[12px] font-mono">
                      {formatTokens(event.burnRatePerMin)}/min
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
