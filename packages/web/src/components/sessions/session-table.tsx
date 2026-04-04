'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function SessionTable({ sessions }: SessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-center text-neutral-500 py-12">
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
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const duration = session.endedAt
            ? formatDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())
            : 'Active';
          const totalTokens = session.inputTokens + session.outputTokens;

          return (
            <TableRow key={session.id}>
              <TableCell>
                <Link href={`/sessions/${session.id}`} className="font-mono text-sm hover:underline">
                  {session.projectSlug}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={session.sessionType === 'human' ? 'default' : 'secondary'}>
                  {session.sessionType}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{session.model}</TableCell>
              <TableCell className="text-sm">
                {new Date(session.startedAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm">{duration}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {(totalTokens / 1000).toFixed(1)}k
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                ${session.costUsd.toFixed(4)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
