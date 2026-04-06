import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redisSub } from './services/redis.js';
import { startSession, updateSession, endSession } from './services/session-service.js';

interface TaggedWebSocket extends WebSocket {
  role?: 'agent' | 'dashboard';
  isAlive?: boolean;
}

export function createWsServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  redisSub.subscribe('pulse:token_events', 'pulse:session_updates').catch(() => {
    console.warn('Redis subscribe failed — WebSocket broadcast will use direct relay');
  });

  redisSub.on('message', (channel, message) => {
    const target = channel === 'pulse:token_events' ? 'token_event' : 'session_update';
    broadcast(wss, { type: target, data: JSON.parse(message) }, 'dashboard');
  });

  wss.on('connection', (ws: TaggedWebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    ws.role = url.searchParams.get('role') === 'agent' ? 'agent' : 'dashboard';
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (ws.role === 'agent') {
          // Persist to DB then broadcast to dashboard
          handleAgentMessage(msg).catch(() => {});
          broadcast(wss, { type: msg.type, data: msg.data }, 'dashboard');
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws: TaggedWebSocket) => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

async function handleAgentMessage(msg: { type: string; data: Record<string, unknown> }): Promise<void> {
  if (msg.type === 'session_start') {
    await startSession({
      id: msg.data.id as string,
      tool: msg.data.tool as string,
      projectSlug: msg.data.projectSlug as string,
      sessionType: msg.data.sessionType as string,
      model: msg.data.model as string,
    }).catch(() => {}); // ignore if session already exists
  } else if (msg.type === 'token_event') {
    const d = msg.data;
    await updateSession({
      sessionId: d.sessionId as string,
      inputTokens: d.inputTokens as number,
      outputTokens: d.outputTokens as number,
      cacheCreationTokens: d.cacheCreationTokens as number,
      cacheReadTokens: d.cacheReadTokens as number,
      costDeltaUsd: d.costDeltaUsd as number,
      cumulativeInputTokens: d.cumulativeInputTokens as number,
      cumulativeOutputTokens: d.cumulativeOutputTokens as number,
      cumulativeCostUsd: d.cumulativeCostUsd as number,
      burnRatePerMin: d.burnRatePerMin as number,
      model: d.model as string,
      tool: d.tool as string,
      projectSlug: d.projectSlug as string,
      sessionType: d.sessionType as string,
    });
  } else if (msg.type === 'session_end') {
    await endSession(msg.data.sessionId as string);
  }
}

function broadcast(wss: WebSocketServer, message: unknown, targetRole: string): void {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client: TaggedWebSocket) => {
    if (client.role === targetRole && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
