'use client';

import { OrganizationProfile } from '@clerk/nextjs';
import { PageHeader } from '@/components/ui/page-header';
import { useWebSocket } from '@/hooks/use-websocket';

export default function MembersPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Members" connected={connected} />
      <div className="p-8 max-w-3xl">
        <OrganizationProfile
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'w-full shadow-none border border-[var(--border)] rounded-[20px]',
            },
          }}
        />
      </div>
    </div>
  );
}
