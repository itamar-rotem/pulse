'use client';

import { useState } from 'react';
import { Send, Trash2, Plus, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatusDot } from '@/components/ui/status-dot';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { useWebhooks, createWebhook, deleteWebhook, testWebhook } from '@/hooks/use-intelligence';
import { fetchApi } from '@/lib/api';
import { formatCost } from '@/lib/format';

export default function SettingsPage() {
  const { connected } = useWebSocket(() => {});
  const { data: summary } = useLiveSummary();
  const { data: webhooks, mutate: mutateWebhooks } = useWebhooks();
  const totalValue = summary?.totalCostToday ?? 0;
  const valueRatio = totalValue > 0 ? Math.round(totalValue / 100) : 0;

  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [whChannel, setWhChannel] = useState<'CUSTOM' | 'SLACK' | 'DISCORD'>('SLACK');
  const [whEvents, setWhEvents] = useState<string[]>(['RULE_BREACH', 'ANOMALY']);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  function toggleEvent(event: string) {
    setWhEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  async function handleCreateWebhook() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createWebhook({ name: whName, url: whUrl, events: whEvents, channel: whChannel, ...(whSecret ? { secret: whSecret } : {}) } as Record<string, unknown> as any);
    setShowAddWebhook(false);
    setWhName('');
    setWhUrl('');
    setWhSecret('');
    setWhChannel('SLACK');
    setWhEvents(['RULE_BREACH', 'ANOMALY']);
    mutateWebhooks();
  }

  async function handleReenableWebhook(id: string) {
    await fetchApi(`/api/webhooks/${id}/enable`, { method: 'POST' });
    mutateWebhooks();
  }

  async function handleTestWebhook(id: string) {
    const result = await testWebhook(id);
    setTestResults((prev) => ({ ...prev, [id]: result }));
    setTimeout(() => setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; }), 5000);
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return;
    await deleteWebhook(id);
    mutateWebhooks();
  }

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
            Configure alert rules in the{' '}
            <a href="/rules" className="text-[var(--accent)] hover:underline">
              Rules page
            </a>
            . View triggered alerts in the{' '}
            <a href="/alerts" className="text-[var(--accent)] hover:underline">
              Alerts page
            </a>
            .
          </p>
        </Section>

        <Section title="Webhooks">
          <div className="space-y-3">
            {webhooks?.map((wh) => {
              const channel = (wh as unknown as Record<string, unknown>).channel as string | undefined;
              const channelLabel = channel === 'SLACK' ? 'Slack' : channel === 'DISCORD' ? 'Discord' : 'Custom';
              const channelVariant = channel === 'SLACK' ? 'purple' as const : channel === 'DISCORD' ? 'blue' as const : 'neutral' as const;

              return (
                <div key={wh.id} className={`flex items-center gap-3 py-2 ${!wh.enabled ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text-1)]">{wh.name}</span>
                      <StatTag variant={channelVariant}>{channelLabel}</StatTag>
                      {!wh.enabled && <StatTag variant="red">Disabled</StatTag>}
                    </div>
                    <div className="text-[12px] text-[var(--text-3)] mt-0.5 truncate">
                      {wh.url.length > 50 ? wh.url.slice(0, 50) + '...' : wh.url}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {(wh.events as string[]).map((ev) => (
                        <StatTag key={ev} variant="neutral">{ev}</StatTag>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {testResults[wh.id] && (
                      <span className={`text-[11px] font-medium ${testResults[wh.id].success ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                        {testResults[wh.id].success ? 'OK' : testResults[wh.id].error || 'Failed'}
                      </span>
                    )}
                    <button
                      onClick={() => handleTestWebhook(wh.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--accent)]"
                      title="Test webhook"
                    >
                      <Send size={13} />
                    </button>
                    {!wh.enabled && (
                      <button
                        onClick={() => handleReenableWebhook(wh.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--green)]"
                        title="Re-enable"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteWebhook(wh.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--red-bg)] text-[var(--text-3)] hover:text-[var(--red)]"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            {(!webhooks || webhooks.length === 0) && !showAddWebhook && (
              <p className="text-[13px] text-[var(--text-3)] py-2">No webhooks configured.</p>
            )}

            {showAddWebhook && (
              <div className="border border-[var(--border)] rounded-[12px] p-4 space-y-3 mt-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Channel</label>
                  <div className="flex gap-2">
                    {(['SLACK', 'DISCORD', 'CUSTOM'] as const).map((ch) => {
                      const labels = { SLACK: 'Slack', DISCORD: 'Discord', CUSTOM: 'Custom Webhook' };
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setWhChannel(ch)}
                          className={`rounded-[8px] px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                            whChannel === ch
                              ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent)]'
                              : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-hover)]'
                          }`}
                        >
                          {labels[ch]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder="Webhook name"
                />
                <input
                  className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder={
                    whChannel === 'SLACK'
                      ? 'https://hooks.slack.com/services/T.../B.../...'
                      : whChannel === 'DISCORD'
                        ? 'https://discord.com/api/webhooks/...'
                        : 'https://hooks.example.com/pulse'
                  }
                />
                {whChannel === 'CUSTOM' && (
                  <input
                    className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                    value={whSecret}
                    onChange={(e) => setWhSecret(e.target.value)}
                    placeholder="Secret (optional, for HMAC signing)"
                  />
                )}
                {whChannel !== 'CUSTOM' && (
                  <p className="text-[11px] text-[var(--text-3)]">
                    {whChannel === 'SLACK'
                      ? 'Paste your Slack Incoming Webhook URL. Pulse sends Block Kit formatted messages with color-coded severity.'
                      : 'Paste your Discord Webhook URL. Pulse sends rich embeds with severity colors and metadata fields.'}
                  </p>
                )}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Events</label>
                  <div className="flex flex-wrap gap-2">
                    {['RULE_BREACH', 'ANOMALY', 'INSIGHT', 'SYSTEM'].map((ev) => (
                      <label key={ev} className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
                        <input
                          type="checkbox"
                          checked={whEvents.includes(ev)}
                          onChange={() => toggleEvent(ev)}
                        />
                        {ev}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddWebhook(false)} className="rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)]">Cancel</button>
                  <button onClick={handleCreateWebhook} disabled={!whName || !whUrl} className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Create</button>
                </div>
              </div>
            )}

            {!showAddWebhook && (
              <button
                onClick={() => setShowAddWebhook(true)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)] hover:underline mt-1"
              >
                <Plus size={13} /> Add Webhook
              </button>
            )}
          </div>
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
      <div className="px-5 py-3 border-b border-[var(--border)]">
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
