'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TokenGauge } from './token-gauge';
import { BurnRate } from './burn-rate';
import { CostMeter } from './cost-meter';

interface ActiveSessionProps {
  session: {
    sessionId: string;
    tool: string;
    sessionType: string;
    model: string;
    projectSlug: string;
    cumulativeInputTokens: number;
    cumulativeOutputTokens: number;
    cumulativeCostUsd: number;
    burnRatePerMin: number;
  } | null;
}

const SESSION_TOKEN_LIMIT = 200_000;

export function ActiveSessionPanel({ session }: ActiveSessionProps) {
  if (!session) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-500">
          No active session detected. Start a Claude Code session to see live data.
        </CardContent>
      </Card>
    );
  }

  const totalTokens = session.cumulativeInputTokens + session.cumulativeOutputTokens;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Active Session</CardTitle>
        <div className="flex gap-2">
          <Badge variant="outline">{session.tool.replace('_', ' ')}</Badge>
          <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
            {session.sessionType}
          </Badge>
          <Badge variant="outline">{session.model}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-500 mb-4">
          Project: <span className="font-mono">{session.projectSlug}</span>
        </p>
        <div className="grid grid-cols-3 gap-6 items-center">
          <TokenGauge used={totalTokens} limit={SESSION_TOKEN_LIMIT} />
          <BurnRate current={session.burnRatePerMin} average={0} />
          <CostMeter cost={session.cumulativeCostUsd} />
        </div>
      </CardContent>
    </Card>
  );
}
