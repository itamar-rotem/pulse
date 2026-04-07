import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { redisSub } from './services/redis.js';
import { startSession, updateSession, endSession } from './services/session-service.js';
import { ruleEngine } from './services/intelligence/rule-engine.js';
import { anomalyDetector } from './services/intelligence/anomaly-detector.js';
import { alertManager } from './services/intelligence/alert-manager.js';

interface TaggedWebSocket extends WebSocket {
  role?: 'agent' | 'dashboard';
  isAlive?: boolean;
}

// Map sessionId → agent WebSocket for targeted pause/resume
const sessionRegistry = new Map<string, TaggedWebSocket>();

export function createWsServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  redisSub.subscribe('pulse:token_events', 'pulse:session_updates', 'pulse:alerts').catch(() => {
    console.warn('Redis subscribe failed — WebSocket broadcast will use direct relay');
  });

  redisSub.on('message', (channel, message) => {
    if (channel === 'pulse:alerts') {
      broadcast(wss, { type: 'alert', data: JSON.parse(message) }, 'dashboard');
    } else {
      const target = channel === 'pulse:token_events' ? 'token_event' : 'session_update';
      broadcast(wss, { type: target, data: JSON.parse(message) }, 'dashboard');
    }
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
          handleAgentMessage(msg, ws).catch(() => {});
          broadcast(wss, { type: msg.type, data: msg.data }, 'dashboard');
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      // Clean up session registry entries for this connection
      for (const [sessionId, socket] of sessionRegistry) {
        if (socket === ws) {
          sessionRegistry.delete(sessionId);
          // Prevent unbounded session history growth
          anomalyDetector.clearSession(sessionId);
        }
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

async function handleAgentMessage(
  msg: { type: string; data: Record<string, unknown> },
  agentWs: TaggedWebSocket,
): Promise<void> {
  if (msg.type === 'session_start') {
    const sessionId = msg.data.id as string;
    sessionRegistry.set(sessionId, agentWs);
    await startSession({
      id: sessionId,
      tool: msg.data.tool as string,
      projectSlug: msg.data.projectSlug as string,
      sessionType: msg.data.sessionType as string,
      model: msg.data.model as string,
    }).catch(() => {}); // ignore if session already exists
  } else if (msg.type === 'token_event') {
    const d = msg.data;
    const sessionId = d.sessionId as string;

    // Register session if not already registered
    if (!sessionRegistry.has(sessionId)) {
      sessionRegistry.set(sessionId, agentWs);
    }

    const result = await updateSession({
      sessionId,
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

    // Update daily cost counter in Redis
    const { redis } = await import('./services/redis.js');
    redis.incrbyfloat('pulse:daily_cost', d.costDeltaUsd as number).catch(() => {});
    // Increment project cost counter in Redis
    const projectSlug = d.projectSlug as string;
    if (projectSlug) {
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:daily`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:weekly`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${projectSlug}:monthly`, d.costDeltaUsd as number).catch(() => {});
    }

    // Intelligence: evaluate rules + detect anomalies
    const [violations, anomalies] = await Promise.all([
      ruleEngine.evaluate(d as any, result.session as any).catch(() => []),
      anomalyDetector.check(d as any, result.session as any).catch(() => []),
    ]);

    for (const v of violations) {
      await alertManager.create({
        type: 'RULE_BREACH',
        severity: v.severity,
        title: `Rule breached: ${v.ruleName}`,
        message: v.message,
        sessionId: v.sessionId || undefined,
        ruleId: v.ruleId,
        metadata: { ruleType: v.ruleType, action: v.action },
      }).catch(() => {});

      if (v.action === 'PAUSE') {
        sendToAgent(v.sessionId, {
          type: 'session_pause',
          sessionId: v.sessionId,
          reason: v.message,
          ruleId: v.ruleId,
        });
      }
    }

    for (const a of anomalies) {
      await alertManager.create({
        type: 'ANOMALY',
        severity: a.severity,
        title: a.title,
        message: a.message,
        sessionId: a.sessionId,
        metadata: a.metadata,
      }).catch(() => {});
    }
  } else if (msg.type === 'session_end') {
    const sessionId = msg.data.sessionId as string;
    const endReason = msg.data.endReason as string | undefined;
    sessionRegistry.delete(sessionId);
    anomalyDetector.clearSession(sessionId);

    // Check for abnormal termination cluster
    const termAnomaly = anomalyDetector.checkAbnormalTerminations(sessionId, endReason);
    if (termAnomaly) {
      await alertManager.create({
        type: 'ANOMALY',
        severity: termAnomaly.severity,
        title: termAnomaly.title,
        message: termAnomaly.message,
        sessionId: termAnomaly.sessionId,
        metadata: termAnomaly.metadata,
      }).catch(() => {});
    }

    await endSession(sessionId);
  }
}

/** Send a message to a specific agent by session ID */
export function sendToAgent(sessionId: string, message: unknown): void {
  const ws = sessionRegistry.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
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
