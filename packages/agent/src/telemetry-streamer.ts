import WebSocket from 'ws';
import type { TokenEvent } from '@pulse/shared';

export type PauseHandler = (sessionId: string, reason: string) => void;
export type ResumeHandler = (sessionId: string) => void;

export class TelemetryStreamer {
  private ws: WebSocket | null = null;
  private buffer: unknown[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pausedSessions = new Set<string>();
  private pauseBuffer = new Map<string, unknown[]>();
  private onPause?: PauseHandler;
  private onResume?: ResumeHandler;

  constructor(private apiUrl: string, private apiKey: string) {}

  /** Register handlers for pause/resume events from the server */
  setHandlers(onPause: PauseHandler, onResume: ResumeHandler): void {
    this.onPause = onPause;
    this.onResume = onResume;
  }

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

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleServerMessage(msg);
        } catch {
          // ignore malformed messages
        }
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

  private handleServerMessage(msg: { type: string; sessionId?: string; reason?: string }): void {
    if (msg.type === 'session_pause' && msg.sessionId) {
      this.pausedSessions.add(msg.sessionId);
      console.log(`Session ${msg.sessionId} paused: ${msg.reason ?? 'no reason'}`);
      this.onPause?.(msg.sessionId, msg.reason ?? '');
    } else if (msg.type === 'session_resume' && msg.sessionId) {
      this.pausedSessions.delete(msg.sessionId);
      console.log(`Session ${msg.sessionId} resumed`);
      this.flushPauseBuffer(msg.sessionId);
      this.onResume?.(msg.sessionId);
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

    // Buffer events for paused sessions instead of sending
    const sessionId = (data as Record<string, unknown>)?.sessionId as string;
    if (sessionId && this.pausedSessions.has(sessionId)) {
      const buf = this.pauseBuffer.get(sessionId) ?? [];
      buf.push(message);
      this.pauseBuffer.set(sessionId, buf);
      return;
    }

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

  sendSessionStart(data: { id: string; tool: string; projectSlug: string; sessionType: string; model: string; userName?: string }): void {
    this.send('session_start', data);
  }

  sendSessionEnd(sessionId: string): void {
    this.pausedSessions.delete(sessionId);
    this.pauseBuffer.delete(sessionId);
    this.send('session_end', { sessionId });
  }

  private flushBuffer(): void {
    while (this.buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buffer.shift();
      this.ws.send(JSON.stringify(msg));
    }
  }

  private flushPauseBuffer(sessionId: string): void {
    const buf = this.pauseBuffer.get(sessionId);
    if (!buf) return;
    this.pauseBuffer.delete(sessionId);
    for (const msg of buf) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.buffer.push(msg);
      }
    }
  }

  isSessionPaused(sessionId: string): boolean {
    return this.pausedSessions.has(sessionId);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
