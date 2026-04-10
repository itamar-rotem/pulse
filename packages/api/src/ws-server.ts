import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { redisSub, redis } from './services/redis.js';
import { prisma as globalPrisma } from './services/prisma.js';
import { createTenantPrisma } from './services/tenant-prisma.js';
import { startSession, updateSession, endSession } from './services/session-service.js';
import { ruleEngine } from './services/intelligence/rule-engine.js';
import { anomalyDetector } from './services/intelligence/anomaly-detector.js';
import { alertManager } from './services/intelligence/alert-manager.js';

const DEFAULT_ORG_ID = 'org_default_seed';

interface TaggedWebSocket extends WebSocket {
  role?: 'agent' | 'dashboard';
  isAlive?: boolean;
  orgId?: string;
  tenantPrisma?: PrismaClient;
}

// Map sessionId → agent WebSocket for targeted pause/resume
const sessionRegistry = new Map<string, TaggedWebSocket>();

async function resolveWsApiKey(
  rawKey: string,
): Promise<{ orgId: string } | null> {
  const prefix = rawKey.slice(0, 12);
  const apiKey = await globalPrisma.apiKey.findFirst({
    where: { prefix, revokedAt: null },
  }).catch(() => null);

  if (apiKey) {
    const valid = await bcrypt.compare(rawKey, apiKey.keyHash).catch(() => false);
    if (valid) {
      // Update lastUsedAt (fire-and-forget)
      globalPrisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});
      return { orgId: apiKey.orgId };
    }
  }

  // Legacy fallback: env-var API key → seed org
  const legacyKey = process.env.AGENT_API_KEY;
  if (legacyKey && rawKey === legacyKey) {
    console.warn('Legacy AGENT_API_KEY used on WS — migrate to org-scoped API keys');
    return { orgId: DEFAULT_ORG_ID };
  }

  return null;
}

function extractApiKey(req: IncomingMessage, url: URL): string | null {
  const queryKey = url.searchParams.get('apiKey');
  if (queryKey) return queryKey;
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string') return headerKey;
  if (Array.isArray(headerKey) && headerKey.length > 0) return headerKey[0];
  return null;
}

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

  wss.on('connection', async (ws: TaggedWebSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    ws.role = url.searchParams.get('role') === 'agent' ? 'agent' : 'dashboard';
    ws.isAlive = true;

    // For agents, require an API key and resolve tenant context before handling any messages
    if (ws.role === 'agent') {
      const apiKey = extractApiKey(req, url);
      if (!apiKey) {
        ws.close(4001, 'API key required');
        return;
      }

      const resolved = await resolveWsApiKey(apiKey).catch(() => null);
      if (!resolved) {
        ws.close(4001, 'Invalid API key');
        return;
      }

      ws.orgId = resolved.orgId;
      ws.tenantPrisma = createTenantPrisma(resolved.orgId);
    }

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
  const db = agentWs.tenantPrisma;
  const orgId = agentWs.orgId;
  if (!db || !orgId) return; // Should never happen — connection would have been closed

  if (msg.type === 'session_start') {
    const sessionId = msg.data.id as string;
    sessionRegistry.set(sessionId, agentWs);
    await startSession({
      id: sessionId,
      tool: msg.data.tool as string,
      projectSlug: msg.data.projectSlug as string,
      sessionType: msg.data.sessionType as string,
      model: msg.data.model as string,
    }, db).catch(() => {}); // ignore if session already exists
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
    }, db);

    // Update daily cost counter in Redis (org-scoped)
    redis.incrbyfloat(`pulse:daily_cost:${orgId}`, d.costDeltaUsd as number).catch(() => {});
    // Increment project cost counters in Redis (org-scoped)
    const projectSlug = d.projectSlug as string;
    if (projectSlug) {
      redis.incrbyfloat(`pulse:project_cost:${orgId}:${projectSlug}:daily`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${orgId}:${projectSlug}:weekly`, d.costDeltaUsd as number).catch(() => {});
      redis.incrbyfloat(`pulse:project_cost:${orgId}:${projectSlug}:monthly`, d.costDeltaUsd as number).catch(() => {});
    }

    // Intelligence: evaluate rules + detect anomalies
    const [violations, anomalies] = await Promise.all([
      ruleEngine.evaluate(d as any, result.session as any, orgId).catch(() => []),
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
      }, db).catch(() => {});

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
      }, db).catch(() => {});
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
      }, db).catch(() => {});
    }

    await endSession(sessionId, db);
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
