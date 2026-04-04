'use client';

import { use } from 'react';
import { Header } from '@/components/layout/header';
import { SessionDetail } from '@/components/sessions/session-detail';
import { useSessionDetail } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import Link from 'next/link';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected } = useWebSocket(() => {});
  const { data: session, isLoading } = useSessionDetail(id);

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <Link href="/sessions" className="text-sm text-neutral-500 hover:underline">
          &larr; Back to sessions
        </Link>
        {isLoading && <p>Loading...</p>}
        {session && <SessionDetail session={session} />}
        {!isLoading && !session && <p>Session not found.</p>}
      </div>
    </div>
  );
}
