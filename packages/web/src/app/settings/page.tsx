'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWebSocket } from '@/hooks/use-websocket';

export default function SettingsPage() {
  const { connected } = useWebSocket(() => {});

  return (
    <div>
      <Header connected={connected} />
      <div className="p-6 space-y-6">
        <h2 className="text-2xl font-bold">Settings</h2>

        <Card>
          <CardHeader>
            <CardTitle>Agent Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">API Server</span>
              <Badge variant={connected ? 'default' : 'secondary'}>
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">WebSocket URL</span>
              <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
                ws://localhost:3001/ws
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monitored Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Claude Code</span>
              <Badge>Active</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Cursor</span>
              <Badge variant="outline">Coming in Phase 5</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Windsurf</span>
              <Badge variant="outline">Coming in Phase 5</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
