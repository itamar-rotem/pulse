import WebSocket from 'ws';
import type { TokenEvent } from '@pulse/shared';

export class TelemetryStreamer {
  private ws: WebSocket | null = null;
  private buffer: unknown[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  constructor(private apiUrl: string, private apiKey: string) {}

  connect(): void {
    try {
      this.ws = new WebSocket(`${this.apiUrl}?role=agent`, {
        headers: { 'x-api-key': this.apiKey },
      });

      this.ws.on('open', () => {
        console.log('Connected to Pulse API');
        this.reconnectDelay = 1000;
        this.flushBuffer();
      });

      this.ws.on('close', () => {
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  send(type: string, data: unknown): void {
    const message = { type, data };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.buffer.push(message);
      if (this.buffer.length > 1000) this.buffer.shift();
    }
  }

  sendTokenEvent(event: TokenEvent): void {
    this.send('token_event', event);
  }

  sendSessionStart(data: { id: string; tool: string; projectSlug: string; sessionType: string; model: string }): void {
    this.send('session_start', data);
  }

  sendSessionEnd(sessionId: string): void {
    this.send('session_end', { sessionId });
  }

  private flushBuffer(): void {
    while (this.buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buffer.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
