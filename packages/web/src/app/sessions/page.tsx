'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { SessionTable } from '@/components/sessions/session-table';
import { useSessionHistory } from '@/hooks/use-sessions';
import { useWebSocket } from '@/hooks/use-websocket';
import { Button } from '@/components/ui/button';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const { connected } = useWebSocket(() => {});
  const { data } = useSessionHistory({ page: String(page), limit: '20' });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Session History</h2>

        <SessionTable sessions={data?.sessions ?? []} />

        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm text-neutral-500 py-2">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
