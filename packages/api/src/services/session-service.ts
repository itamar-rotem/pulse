import { PrismaClient } from '@prisma/client';
import { publishTokenEvent, publishSessionUpdate } from './redis.js';

const prisma = new PrismaClient();

export async function startSession(data: {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
}) {
  const session = await prisma.session.create({
    data: {
      id: data.id,
      tool: data.tool,
      projectSlug: data.projectSlug,
      sessionType: data.sessionType,
      model: data.model,
    },
  });
  await publishSessionUpdate(session);
  return session;
}

export async function updateSession(data: {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costDeltaUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
  model: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
}) {
  const event = await prisma.tokenEvent.create({
    data: {
      sessionId: data.sessionId,
      tool: data.tool,
      model: data.model,
      projectSlug: data.projectSlug,
      sessionType: data.sessionType,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      cacheReadTokens: data.cacheReadTokens,
      costDeltaUsd: data.costDeltaUsd,
      cumulativeInputTokens: data.cumulativeInputTokens,
      cumulativeOutputTokens: data.cumulativeOutputTokens,
      cumulativeCostUsd: data.cumulativeCostUsd,
      burnRatePerMin: data.burnRatePerMin,
    },
  });

  const session = await prisma.session.update({
    where: { id: data.sessionId },
    data: {
      inputTokens: data.cumulativeInputTokens,
      outputTokens: data.cumulativeOutputTokens,
      cacheCreationTokens: { increment: data.cacheCreationTokens },
      cacheReadTokens: { increment: data.cacheReadTokens },
      costUsd: data.cumulativeCostUsd,
      model: data.model,
    },
  });

  await publishTokenEvent(event);
  await publishSessionUpdate(session);
  return { event, session };
}

export async function endSession(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });
  await publishSessionUpdate(session);
  return session;
}

export async function getSessionHistory(query: {
  page?: number;
  limit?: number;
  tool?: string;
  projectSlug?: string;
  sessionType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (query.tool) where.tool = query.tool;
  if (query.projectSlug) where.projectSlug = query.projectSlug;
  if (query.sessionType) where.sessionType = query.sessionType;
  if (query.startDate || query.endDate) {
    where.startedAt = {};
    if (query.startDate) (where.startedAt as Record<string, unknown>).gte = new Date(query.startDate);
    if (query.endDate) (where.startedAt as Record<string, unknown>).lte = new Date(query.endDate);
  }

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.session.count({ where }),
  ]);

  return { sessions, total, page, limit };
}

export async function getSessionById(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: { tokenEvents: { orderBy: { timestamp: 'asc' } } },
  });
}

export async function getLiveSummary() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [activeSessions, todayStats] = await Promise.all([
    prisma.session.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  const [humanStats, agentStats] = await Promise.all([
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart }, sessionType: 'human' },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.session.aggregate({
      where: { startedAt: { gte: todayStart }, sessionType: { not: 'human' } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  return {
    activeSessions: activeSessions.length,
    activeSessionDetails: activeSessions,
    totalCostToday: todayStats._sum.costUsd || 0,
    humanCostToday: humanStats._sum.costUsd || 0,
    agentCostToday: agentStats._sum.costUsd || 0,
    humanSessionsToday: humanStats._count || 0,
    agentSessionsToday: agentStats._count || 0,
  };
}
