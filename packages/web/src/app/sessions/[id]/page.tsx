'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SessionDetail } from '@/components/sessions/session-detail';
import { useSessionDetail } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { connected } = useWebSocket(() => {});
  const { data: session, isLoading } = useSessionDetail(id);

  return (
    <div>
      <PageHeader title="Session Detail" connected={connected}>
        <Link
          href="/sessions"
          className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <ArrowLeft size={14} />
          Back to Sessions
        </Link>
      </PageHeader>
      <div className="p-8">
        {isLoading && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Loading session...
          </p>
        )}
        {session && <SessionDetail session={session} />}
        {!isLoading && !session && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Session not found.
          </p>
        )}
      </div>
    </div>
  );
}
