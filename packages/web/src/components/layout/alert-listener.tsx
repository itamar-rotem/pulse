'use client';

import { useCallback } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/components/ui/toast-context';

interface AlertPayload {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  sessionId?: string | null;
}

/**
 * Invisible component that listens for alert messages on the global
 * WebSocket and pushes them into the toast queue. Mounted once in the
 * root layout so toasts appear on every page.
 */
export function AlertListener() {
  const { addToast } = useToast();

  const handleMessage = useCallback(
    (msg: { type: string; data: unknown }) => {
      if (msg.type !== 'alert') return;
      const alert = msg.data as AlertPayload;
      if (!alert.title) return;

      addToast({
        severity: alert.severity ?? 'INFO',
        title: alert.title,
        message: alert.message ?? '',
        href: alert.sessionId ? `/sessions/${alert.sessionId}` : '/alerts',
      });
    },
    [addToast],
  );

  useWebSocket(handleMessage);

  return null;
}
