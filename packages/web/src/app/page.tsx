'use client';

import { Header } from '@/components/layout/header';
import { TodaySummary } from '@/components/live/today-summary';
import { SessionTable } from '@/components/sessions/session-table';
import { useLiveSummary, useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DashboardHome() {
  const { connected } = useWebSocket(() => {});
  const { data: summary } = useLiveSummary();
  const { data: historyData } = useSessionHistory({ limit: '5' });

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>

        <TodaySummary
          totalCost={summary?.totalCostToday ?? 0}
          humanCost={summary?.humanCostToday ?? 0}
          agentCost={summary?.agentCostToday ?? 0}
          humanSessions={summary?.humanSessionsToday ?? 0}
          agentSessions={summary?.agentSessionsToday ?? 0}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Sessions</CardTitle>
            <Link href="/sessions" className="text-sm text-neutral-500 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <SessionTable sessions={historyData?.sessions ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
