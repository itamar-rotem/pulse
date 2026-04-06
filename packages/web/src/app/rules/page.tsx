'use client';

import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function RulesPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Rules" connected={connected} />
      <ComingSoon
        icon={ShieldCheck}
        title="Governance rules are coming"
        description="Define and enforce usage policies across your team. Set cost limits, restrict models, require cache usage, and automatically enforce recommendations from the Insights page."
        previewCards={[
          {
            title: 'Daily cost cap',
            description: 'Enforce a maximum daily API-equivalent cost per developer or project.',
          },
          {
            title: 'Model restrictions',
            description: 'Restrict agent sessions to Sonnet-class models to control costs.',
          },
        ]}
      />
    </div>
  );
}
