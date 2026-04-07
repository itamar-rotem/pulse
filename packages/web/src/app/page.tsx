'use client';

import { useState, useCallback } from 'react';
import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { InsightCard } from '@/components/ui/insight-card';
import { TodaySummary } from '@/components/live/today-summary';
import { TokenFlowChart } from '@/components/live/token-flow-chart';
import { ActiveSessions } from '@/components/live/active-sessions';
import { SessionTable } from '@/components/sessions/session-table';
import { useLiveSummary, useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import { useInsights, dismissInsight, applyInsight } from '@/hooks/use-intelligence';

interface LiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
}

export default function DashboardHome() {
  const [activeSessions, setActiveSessions] = useState<Map<string, LiveSession>>(new Map());
  const [insightDismissed, setInsightDismissed] = useState(false);

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession;
      setActiveSessions((prev) => new Map(prev).set(event.sessionId, event));
    } else if (msg.type === 'session_end') {
      const data = msg.data as { sessionId: string };
      setActiveSessions((prev) => {
        const next = new Map(prev);
        next.delete(data.sessionId);
        return next;
      });
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);
  const { data: summary } = useLiveSummary();
  const { data: historyData } = useSessionHistory({ limit: '5' });
  const { data: insightData } = useInsights({ status: 'ACTIVE', limit: 1 });
  const latestInsight = insightData?.insights?.[0];

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  const tokenFlowData = (historyData?.sessions ?? []).map((s) => ({
    time: new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
  })).reverse();

  return (
    <div>
      <PageHeader
        title={greeting}
        subtitle={`${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${summary?.activeSessions ?? 0} active sessions`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3">
            <TokenFlowChart data={tokenFlowData} />
          </div>
          <div className="col-span-2">
            <ActiveSessions sessions={Array.from(activeSessions.values())} />
          </div>
        </div>

        <TodaySummary
          totalCost={summary?.totalCostToday ?? 0}
          humanCost={summary?.humanCostToday ?? 0}
          agentCost={summary?.agentCostToday ?? 0}
          humanSessions={summary?.humanSessionsToday ?? 0}
          agentSessions={summary?.agentSessionsToday ?? 0}
          totalInputTokens={summary?.totalInputTokens ?? 0}
          totalOutputTokens={summary?.totalOutputTokens ?? 0}
          totalCacheCreationTokens={summary?.totalCacheCreationTokens ?? 0}
          totalCacheReadTokens={summary?.totalCacheReadTokens ?? 0}
        />

        {!insightDismissed && latestInsight && (
          <InsightCard
            icon={Lightbulb}
            title={latestInsight.title}
            description={latestInsight.description}
            actionLabel={(latestInsight.metadata as Record<string, unknown>).suggestedRule ? 'Apply' : undefined}
            onAction={(latestInsight.metadata as Record<string, unknown>).suggestedRule ? () => { applyInsight(latestInsight.id); setInsightDismissed(true); } : undefined}
            onDismiss={() => { dismissInsight(latestInsight.id); setInsightDismissed(true); }}
          />
        )}

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-[var(--text-1)]">
              Recent Sessions
            </h3>
            <Link
              href="/sessions"
              className="text-[12px] font-medium text-[var(--accent)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="px-5 pb-5">
            <SessionTable sessions={historyData?.sessions ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
