'use client';

import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

interface WsMessage {
  type: string;
  data: unknown;
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  // Sync callback ref inside effect, not during render
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    closedRef.current = false;

    async function connect() {
      if (closedRef.current) return;
      try {
        const token = await getAuthToken();
        if (closedRef.current) return;
        if (!token) {
          reconnectTimerRef.current = setTimeout(connect, 500);
          return;
        }

        const url = `${WS_URL}?role=dashboard&token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);

        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
          setConnected(false);
          if (closedRef.current) return;
          reconnectTimerRef.current = setTimeout(connect, 2000);
        };
        ws.onerror = () => {
          // Will trigger onclose
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            onMessageRef.current(msg);
          } catch {
            // Ignore malformed messages
          }
        };

        wsRef.current = ws;
      } catch {
        if (closedRef.current) return;
        reconnectTimerRef.current = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, []);

  return { connected };
}
