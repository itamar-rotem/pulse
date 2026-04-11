import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { verifyToken } from '@clerk/backend';
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

async function resolveClerkTokenForWs(
  token: string,
): Promise<{ orgId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } | null> {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    const payload = await verifyToken(token, { secretKey });
    if (!payload.org_id) return null;

    const org = await globalPrisma.organization.findUnique({
      where: { clerkOrgId: payload.org_id },
    });
    if (!org) return null;

    const clerkRole = payload.org_role as string;
    let role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER';
    if (clerkRole === 'org:admin') role = 'ADMIN';
    if (clerkRole === 'org:owner' || clerkRole === 'admin') role = 'OWNER';

    return { orgId: org.id, role };
  } catch {
    return null;
  }
}

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
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    const payloadOrgId = typeof parsed.orgId === 'string' ? parsed.orgId : undefined;
    const envelopeType =
      channel === 'pulse:alerts'
        ? 'alert'
        : channel === 'pulse:token_events'
          ? 'token_event'
          : 'session_update';
    broadcastToDashboard(wss, { type: envelopeType, data: parsed }, payloadOrgId);
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
    } else {
      // Dashboard connections authenticate via Clerk Bearer token so broadcasts
      // can be org-scoped. Token must arrive as a ?token=<jwt> query param.
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Authentication token required');
        return;
      }
      const resolved = await resolveClerkTokenForWs(token).catch(() => null);
      if (!resolved) {
        ws.close(4001, 'Invalid or expired token');
        return;
      }
      ws.orgId = resolved.orgId;
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (ws.role === 'agent') {
          handleAgentMessage(msg, ws).catch(() => {});
          // Tag direct relay with the agent's orgId so dashboard clients in
          // other orgs don't see it.
          const relayData =
            msg.data && typeof msg.data === 'object'
              ? { ...msg.data, orgId: ws.orgId }
              : msg.data;
          broadcastToDashboard(wss, { type: msg.type, data: relayData }, ws.orgId);
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
      orgId,
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
      orgId,
    }, db);

    // Update daily cost counter in Redis (org-scoped), with TTL as belt-and-suspenders.
    // The midnight cron deletes these keys; the NX TTL guarantees bounded growth even if
    // the cron fails to run on a given day.
    const cost = d.costDeltaUsd as number;
    {
      const key = `pulse:daily_cost:${orgId}`;
      const pipeline = redis.pipeline();
      pipeline.incrbyfloat(key, cost);
      pipeline.expire(key, 90000, 'NX'); // 25h
      pipeline.exec().catch(() => {});
    }

    // Increment project cost counters in Redis (org-scoped), keyed by projectId
    // (not slug) so project renames can't stale-key counters. The Session row
    // already has projectId, which we resolved during updateSession.
    const projectId = (result.session as { projectId?: string | null }).projectId;
    if (projectId) {
      const periods: Array<['daily' | 'weekly' | 'monthly', number]> = [
        ['daily', 90000],      // 25h
        ['weekly', 691200],    // 8d
        ['monthly', 2764800],  // 32d
      ];
      for (const [period, ttl] of periods) {
        const key = `pulse:project_cost:${orgId}:${projectId}:${period}`;
        const pipeline = redis.pipeline();
        pipeline.incrbyfloat(key, cost);
        pipeline.expire(key, ttl, 'NX');
        pipeline.exec().catch(() => {});
      }
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

/**
 * Broadcast a message to all dashboard clients, filtered by orgId for tenant isolation.
 * If `payloadOrgId` is provided, only dashboard clients whose `orgId` matches will receive
 * the message. A missing client `orgId` or missing payload `orgId` is permissive — this
 * defensively handles the rollout window where legacy payloads may lack orgId.
 */
function broadcastToDashboard(
  wss: WebSocketServer,
  message: unknown,
  payloadOrgId?: string,
): void {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client: TaggedWebSocket) => {
    if (client.role !== 'dashboard') return;
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.orgId && payloadOrgId && client.orgId !== payloadOrgId) return;
    client.send(payload);
  });
}
