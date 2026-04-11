'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bell, ExternalLink, X, Eye } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTag } from '@/components/ui/stat-tag';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAlerts, markAlertRead, dismissAlert, batchMarkAlertsRead } from '@/hooks/use-intelligence';
import { useProjects } from '@/hooks/use-projects';
import { formatRelativeTime } from '@/lib/format';
import type { AlertStatus, Severity, AlertType } from '@pulse/shared';

const SEVERITY_VARIANT: Record<Severity, 'blue' | 'amber' | 'red'> = {
  INFO: 'blue',
  WARNING: 'amber',
  CRITICAL: 'red',
};

const TYPE_LABEL: Record<AlertType, string> = {
  RULE_BREACH: 'Rule Breach',
  ANOMALY: 'Anomaly',
  INSIGHT: 'Insight',
  SYSTEM: 'System',
};

export default function AlertsPage() {
  return (
    <Suspense fallback={null}>
      <AlertsPageInner />
    </Suspense>
  );
}

function AlertsPageInner() {
  const searchParams = useSearchParams();
  const { connected } = useWebSocket(() => {});
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('');
  const [projectFilter, setProjectFilter] = useState<string>(
    searchParams.get('projectId') ?? '',
  );
  const { data: projectsData } = useProjects({ status: 'all' });
  const projects = projectsData?.projects ?? [];
  const { data, mutate } = useAlerts({
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
    projectId: projectFilter || undefined,
    limit: 50,
  });

  const alerts = data?.alerts ?? [];

  async function handleMarkRead(id: string) {
    await markAlertRead(id);
    mutate();
  }

  async function handleDismiss(id: string) {
    await dismissAlert(id);
    mutate();
  }

  async function handleMarkAllRead() {
    const activeIds = alerts.filter((a) => a.status === 'ACTIVE').map((a) => a.id);
    if (activeIds.length > 0) {
      await batchMarkAlertsRead(activeIds);
      mutate();
    }
  }

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Real-time notifications from rules and anomaly detection" connected={connected} />

      <div className="px-8 py-6 max-w-5xl">
        {/* Filters + actions */}
        <div className="flex items-center gap-3">
          <select
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AlertStatus | '')}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="READ">Read</option>
            <option value="DISMISSED">Dismissed</option>
          </select>

          <select
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | '')}
          >
            <option value="">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>

          <select
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text-2)]"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleMarkAllRead}
            className="ml-auto text-[13px] font-medium text-[var(--accent)] hover:underline"
          >
            Mark all read
          </button>
        </div>

        {/* Alert list */}
        <div className="mt-4 space-y-2">
          {alerts.length === 0 && (
            <div className="text-center py-16 text-[var(--text-3)]">
              <Bell size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-[15px] font-medium">No alerts yet</p>
              <p className="text-[13px] mt-1">Alerts will appear here when rules are triggered or anomalies detected</p>
            </div>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-[16px] border bg-[var(--surface)] p-4 transition-colors ${
                alert.status === 'ACTIVE'
                  ? 'border-[var(--border)]'
                  : 'border-[var(--border)] opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatTag variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</StatTag>
                    <StatTag variant="neutral">{TYPE_LABEL[alert.type]}</StatTag>
                    <span className="text-[11px] text-[var(--text-3)]">
                      {formatRelativeTime(alert.createdAt)}
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold text-[var(--text-1)]">{alert.title}</p>
                  <p className="text-[13px] text-[var(--text-2)] mt-0.5">{alert.message}</p>
                  {alert.sessionId && (
                    <a
                      href={`/sessions/${alert.sessionId}`}
                      className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium text-[var(--accent)] hover:underline"
                    >
                      View session <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                {alert.status === 'ACTIVE' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMarkRead(alert.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                      title="Mark as read"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
