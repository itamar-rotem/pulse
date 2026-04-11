'use client';

import { useState, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionCard } from '@/components/live/session-card';
import { TokenStream } from '@/components/live/token-stream';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';
import { useProjects } from '@/hooks/use-projects';

interface LiveSession {
  sessionId: string;
  tool: string;
  sessionType: string;
  model: string;
  projectId?: string;
  projectSlug: string;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  startedAt?: string;
}

interface StreamEvent {
  timestamp: string;
  projectSlug: string;
  inputTokensDelta: number;
  outputTokensDelta: number;
  costDelta: number;
  burnRatePerMin: number;
}

export default function LivePage() {
  const [sessions, setSessions] = useState<Map<string, LiveSession>>(new Map());
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>('');
  useLiveSummary();
  const { data: projectsData } = useProjects({ status: 'all' });
  const projects = projectsData?.projects ?? [];

  const handleMessage = useCallback((msg: { type: string; data: unknown }) => {
    if (msg.type === 'token_event') {
      const event = msg.data as LiveSession & {
        inputTokens?: number;
        outputTokens?: number;
        costUsd?: number;
      };
      setSessions((prev) => new Map(prev).set(event.sessionId, event));

      setStreamEvents((prev) => [
        {
          timestamp: new Date().toISOString(),
          projectSlug: event.projectSlug,
          inputTokensDelta: event.inputTokens ?? 0,
          outputTokensDelta: event.outputTokens ?? 0,
          costDelta: event.costUsd ?? 0,
          burnRatePerMin: event.burnRatePerMin,
        },
        ...prev,
      ].slice(0, 100));
    } else if (msg.type === 'session_end') {
      const data = msg.data as { sessionId: string };
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(data.sessionId);
        return next;
      });
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);
  const sessionList = useMemo(() => {
    const list = Array.from(sessions.values());
    if (!projectFilter) return list;
    return list.filter((s) => s.projectId === projectFilter);
  }, [sessions, projectFilter]);

  return (
    <div>
      <PageHeader
        title="Live View"
        subtitle={`${sessionList.length} active session${sessionList.length !== 1 ? 's' : ''}`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--text-3)]">Project</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {sessionList.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {sessionList.map((s) => (
              <SessionCard key={s.sessionId} {...s} />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <p className="text-[13px] text-[var(--text-2)]">
              No active sessions. Start a Claude Code session to see live data.
            </p>
          </div>
        )}

        <TokenStream events={streamEvents} />
      </div>
    </div>
  );
}
