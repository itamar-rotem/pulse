'use client';

import Link from 'next/link';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { formatTokens, formatCost, getBurnRateStatus } from '@/lib/format';

interface ActiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  durationMinutes?: number;
}

interface ActiveSessionsProps {
  sessions: ActiveSession[];
}

const statusVariant = {
  healthy: 'green' as const,
  warning: 'amber' as const,
  hot: 'red' as const,
};

export function ActiveSessions({ sessions }: ActiveSessionsProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
          Active Sessions
        </h3>
        <p className="text-[13px] text-[var(--text-2)] py-8 text-center">
          No active sessions right now
        </p>
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) => b.cumulativeCostUsd - a.cumulativeCostUsd);

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
        Active Sessions
        <span className="ml-2 text-[var(--text-3)] font-normal">
          ({sessions.length})
        </span>
      </h3>
      <div className="space-y-2">
        {sorted.map((s) => {
          const status = getBurnRateStatus(s.burnRatePerMin);
          return (
            <Link
              key={s.sessionId}
              href={`/sessions/${s.sessionId}`}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[var(--surface-hover)]"
            >
              <StatusDot variant={statusVariant[status]} pulse />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-1)] truncate">
                  {s.projectSlug}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <StatTag variant={s.sessionType === 'human' ? 'blue' : 'purple'}>
                    {s.sessionType}
                  </StatTag>
                  <span className="text-[10px] text-[var(--text-3)]">{s.model}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-bold font-mono text-[var(--text-1)]">
                  {formatCost(s.cumulativeCostUsd)}
                </p>
                <p className="text-[10px] text-[var(--text-3)] font-mono">
                  {formatTokens(s.burnRatePerMin)}/min
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
