'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionCard } from '@/components/live/session-card';
import { TokenStream } from '@/components/live/token-stream';
import { useWebSocket } from '@/hooks/use-websocket';
import { useLiveSummary } from '@/hooks/use-sessions';

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
  const { data: summary } = useLiveSummary();

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
  const sessionList = Array.from(sessions.values());

  return (
    <div>
      <PageHeader
        title="Live View"
        subtitle={`${sessionList.length} active session${sessionList.length !== 1 ? 's' : ''}`}
        connected={connected}
      />
      <div className="p-8 space-y-6">
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
