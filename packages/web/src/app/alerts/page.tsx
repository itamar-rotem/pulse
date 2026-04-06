'use client';

import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function AlertsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Alerts" connected={connected} />
      <ComingSoon
        icon={Bell}
        title="Alerts are coming"
        description="Get notified when sessions exceed cost thresholds, burn rates spike, or anomalies are detected. Configure delivery via email, Slack, or in-app notifications."
        previewCards={[
          {
            title: 'Cost threshold exceeded',
            description: 'Alert when any single session exceeds $50 in API-equivalent value.',
          },
          {
            title: 'Burn rate spike',
            description: 'Alert when burn rate exceeds 3x the project average for more than 5 minutes.',
          },
        ]}
      />
    </div>
  );
}
