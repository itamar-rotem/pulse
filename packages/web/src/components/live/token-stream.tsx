'use client';

import { useRef, useEffect } from 'react';
import { formatTokens, formatCost } from '@/lib/format';

interface TokenEvent {
  timestamp: string;
  projectSlug: string;
  inputTokensDelta: number;
  outputTokensDelta: number;
  costDelta: number;
  burnRatePerMin: number;
}

interface TokenStreamProps {
  events: TokenEvent[];
  maxEvents?: number;
}

export function TokenStream({ events, maxEvents = 50 }: TokenStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const visible = events.slice(0, maxEvents);

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-5 py-3 border-b border-[var(--border-light)]">
        <h3 className="text-sm font-semibold text-[var(--text-1)]">
          Token Stream
        </h3>
      </div>
      <div ref={scrollRef} className="max-h-[300px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-[13px] text-[var(--text-2)] py-8 text-center">
            Waiting for token events...
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {visible.map((event, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-5 py-2 text-[12px] font-mono animate-[fade-in_0.2s_ease-out]"
              >
                <span className="text-[var(--text-3)] w-16 shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-[var(--text-1)] font-medium truncate w-24">
                  {event.projectSlug}
                </span>
                <span className="text-[var(--blue)] w-16 text-right">
                  +{formatTokens(event.inputTokensDelta + event.outputTokensDelta)}
                </span>
                <span className="text-[var(--text-2)] w-16 text-right">
                  +{formatCost(event.costDelta)}
                </span>
                <span className="text-[var(--text-3)] w-20 text-right">
                  {formatTokens(event.burnRatePerMin)}/min
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
