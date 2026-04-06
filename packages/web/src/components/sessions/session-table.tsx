'use client';

import Link from 'next/link';
import { StatTag } from '@/components/ui/stat-tag';
import { Sparkline } from '@/components/ui/sparkline';
import { formatTokens, formatCost, formatDuration } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Session {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface SessionTableProps {
  sessions: Session[];
}

export function SessionTable({ sessions }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-center text-[var(--text-2)] py-12 text-[13px]">
        No sessions recorded yet. Start using Claude Code with the Pulse agent running.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const totalTokens = session.inputTokens + session.outputTokens;
          const duration = formatDuration(session.startedAt, session.endedAt);
          const isAnomaly = session.costUsd > 50;
          const sparkData = [session.inputTokens, session.outputTokens];

          return (
            <TableRow key={session.id} className="group cursor-pointer">
              <TableCell>
                <Link
                  href={`/sessions/${session.id}`}
                  className="text-[13px] font-semibold text-[var(--text-1)] hover:text-[var(--accent)]"
                >
                  {session.projectSlug}
                </Link>
              </TableCell>
              <TableCell>
                <StatTag variant={session.sessionType === 'human' ? 'blue' : 'purple'}>
                  {session.sessionType}
                </StatTag>
              </TableCell>
              <TableCell className="text-[12px] text-[var(--text-2)]">
                {session.model}
              </TableCell>
              <TableCell className="text-[12px] text-[var(--text-2)]">
                {duration}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Sparkline data={sparkData} height={14} />
                  <span className="text-[12px] font-mono text-[var(--text-1)]">
                    {formatTokens(totalTokens)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`text-[12px] font-mono font-semibold ${
                    isAnomaly ? 'text-[var(--red)]' : 'text-[var(--text-1)]'
                  }`}
                >
                  {formatCost(session.costUsd)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
