'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionTable } from '@/components/sessions/session-table';
import { SessionFilters } from '@/components/sessions/session-filters';
import { useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const [sessionType, setSessionType] = useState('all');
  const [project, setProject] = useState('all');
  const [model, setModel] = useState('all');
  const [timeRange, setTimeRange] = useState('24h');

  const { connected } = useWebSocket(() => {});
  const { data } = useSessionHistory({ page: String(page), limit: '20' });

  const projects = useMemo(() => {
    if (!data?.sessions) return [];
    return [...new Set(data.sessions.map((s) => s.projectSlug))];
  }, [data]);

  const models = useMemo(() => {
    if (!data?.sessions) return [];
    return [...new Set(data.sessions.map((s) => s.model))];
  }, [data]);

  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return [];
    return data.sessions.filter((s) => {
      if (sessionType !== 'all' && s.sessionType !== sessionType) return false;
      if (project !== 'all' && s.projectSlug !== project) return false;
      if (model !== 'all' && s.model !== model) return false;
      return true;
    });
  }, [data, sessionType, project, model]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle={`${data?.total ?? 0} total sessions`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        <SessionFilters
          sessionType={sessionType}
          onSessionTypeChange={setSessionType}
          project={project}
          onProjectChange={setProject}
          model={model}
          onModelChange={setModel}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          projects={projects}
          models={models}
        />

        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <SessionTable sessions={filteredSessions} />
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-[12px] text-[var(--text-2)] px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
