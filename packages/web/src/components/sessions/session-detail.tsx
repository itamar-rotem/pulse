'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  const chartData = session.tokenEvents.map((e) => ({
    time: new Date(e.timestamp).toLocaleTimeString(),
    cost: e.cumulativeCostUsd,
    tokens: e.cumulativeInputTokens + e.cumulativeOutputTokens,
    burnRate: e.burnRatePerMin,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold font-mono">{session.projectSlug}</h2>
        <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
          {session.sessionType}
        </Badge>
        <Badge variant="outline">{session.model}</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-neutral-500">Total Cost</p>
            <p className="text-xl font-bold font-mono">${session.costUsd.toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-neutral-500">Input Tokens</p>
            <p className="text-xl font-bold font-mono">{(session.inputTokens / 1000).toFixed(1)}k</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-neutral-500">Output Tokens</p>
            <p className="text-xl font-bold font-mono">{(session.outputTokens / 1000).toFixed(1)}k</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-neutral-500">Cache Tokens</p>
            <p className="text-xl font-bold font-mono">
              {((session.cacheCreationTokens + session.cacheReadTokens) / 1000).toFixed(1)}k
            </p>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(value: number) => `$${value.toFixed(4)}`} />
                <Line type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
