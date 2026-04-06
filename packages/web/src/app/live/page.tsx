'use client';

import { useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { Header } from '@/components/layout/header';
import { ActiveSessionPanel } from '@/components/live/active-session-panel';
import { TodaySummary } from '@/components/live/today-summary';

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

export default function LivePage() {
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const { data: summary } = useLiveSummary();

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession;
      setActiveSession(event);
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Live View</h2>

        <ActiveSessionPanel session={activeSession} />

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
      </div>
    </div>
  );
}
