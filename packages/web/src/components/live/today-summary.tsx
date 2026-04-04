import { Card, CardContent } from '@/components/ui/card';

interface TodaySummaryProps {
  totalCost: number;
  humanCost: number;
  agentCost: number;
  humanSessions: number;
  agentSessions: number;
}

export function TodaySummary({ totalCost, humanCost, agentCost, humanSessions, agentSessions }: TodaySummaryProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-neutral-500">Total Spend Today</p>
          <p className="text-2xl font-bold font-mono">${totalCost.toFixed(2)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-neutral-500">Human Sessions</p>
          <p className="text-2xl font-bold font-mono">${humanCost.toFixed(2)}</p>
          <p className="text-xs text-neutral-500">{humanSessions} sessions</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-neutral-500">Agent Runs</p>
          <p className="text-2xl font-bold font-mono">${agentCost.toFixed(2)}</p>
          <p className="text-xs text-neutral-500">{agentSessions} runs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-neutral-500">Cost Tracked</p>
          <p className="text-2xl font-bold font-mono text-green-500">
            ${totalCost.toFixed(2)}
          </p>
          <p className="text-xs text-neutral-500">cumulative</p>
        </CardContent>
      </Card>
    </div>
  );
}
