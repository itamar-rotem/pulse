'use client';

import { PageHeader } from '@/components/ui/page-header';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { formatCost } from '@/lib/format';

export default function SettingsPage() {
  const { connected } = useWebSocket(() => {});
  const { data: summary } = useLiveSummary();
  const totalValue = summary?.totalCostToday ?? 0;
  const valueRatio = totalValue > 0 ? Math.round(totalValue / 100) : 0;

  return (
    <div>
      <PageHeader title="Settings" connected={connected} />
      <div className="p-8 space-y-6 max-w-2xl">
        <Section title="Plan">
          <Row label="Plan" value={<StatTag variant="green">Max Plan</StatTag>} />
          <Row label="Monthly Cost" value="$100/mo" />
          <Row
            label="Value Ratio"
            value={
              <span className="font-mono font-bold text-[var(--green)]">
                {valueRatio}x
              </span>
            }
          />
          <Row
            label="Today's Value"
            value={
              <span className="font-mono">{formatCost(totalValue)}</span>
            }
          />
        </Section>

        <Section title="Agent">
          <Row
            label="Connection Status"
            value={
              <div className="flex items-center gap-2">
                <StatusDot variant={connected ? 'green' : 'red'} pulse={connected} />
                <span className="text-[13px]">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            }
          />
          <Row
            label="API Endpoint"
            value={
              <code className="text-[12px] bg-[var(--surface-hover)] px-2 py-0.5 rounded-md font-mono">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
              </code>
            }
          />
          <Row
            label="WebSocket"
            value={
              <code className="text-[12px] bg-[var(--surface-hover)] px-2 py-0.5 rounded-md font-mono">
                {process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'}
              </code>
            }
          />
        </Section>

        <Section title="Display">
          <Row label="Timezone" value="Browser default" />
          <Row label="Token Format" value="Abbreviated (k / M / B)" />
          <Row label="Currency" value="USD ($)" />
        </Section>

        <Section title="Notifications">
          <p className="text-[13px] text-[var(--text-2)] py-2">
            Configure alerts and notifications in the{' '}
            <a href="/alerts" className="text-[var(--accent)] hover:underline">
              Alerts page
            </a>{' '}
            (coming soon).
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[var(--border-light)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">{title}</h3>
      </div>
      <div className="px-5 py-3 space-y-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-[var(--text-2)]">{label}</span>
      <div className="text-[13px] text-[var(--text-1)]">{value}</div>
    </div>
  );
}
