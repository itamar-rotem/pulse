'use client';

import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useWebSocket } from '@/hooks/use-websocket';

export default function InsightsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <PageHeader title="Insights" connected={connected} />
      <ComingSoon
        icon={Lightbulb}
        title="Intelligence features are coming"
        description="Insights will analyze your usage patterns and provide actionable recommendations to optimize costs, improve cache efficiency, and detect anomalies across your AI tool sessions."
        previewCards={[
          {
            title: 'Cache optimization opportunity',
            description: 'Enable prompt caching on 3 projects to save ~$45/mo in API-equivalent costs.',
          },
          {
            title: 'Unusual burn rate detected',
            description: 'Project "api-refactor" consumed 3x its average tokens yesterday. Review for runaway loops.',
          },
          {
            title: 'Agent session efficiency',
            description: 'Agent sessions average 2.1x more tokens than human sessions for similar tasks.',
          },
        ]}
      />
    </div>
  );
}
