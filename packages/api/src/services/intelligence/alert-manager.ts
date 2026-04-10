import { Prisma, type PrismaClient } from '@prisma/client';
import { publishAlert } from '../redis.js';
import { webhookService } from './webhook-service.js';
import type { CreateAlertInput, AlertFilters, Alert } from '@pulse/shared';

class AlertManager {
  async create(input: CreateAlertInput, db: PrismaClient): Promise<Alert> {
    const alert = await db.alert.create({
      // orgId auto-injected by tenant-scoped client
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        sessionId: input.sessionId ?? null,
        ruleId: input.ruleId ?? null,
        insightId: input.insightId ?? null,
      } as any,
    });

    // Update rule trigger stats if this is a rule breach
    if (input.ruleId) {
      await db.rule.update({
        where: { id: input.ruleId },
        data: {
          triggerCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      }).catch(() => {}); // non-critical
    }

    // Broadcast via Redis to dashboard WebSocket clients
    await publishAlert(alert);

    // Dispatch to webhooks (async, non-blocking)
    void Promise.resolve(webhookService.dispatch(alert as unknown as Alert, db)).catch(() => {});

    return alert as unknown as Alert;
  }

  async markRead(id: string, db: PrismaClient): Promise<void> {
    await db.alert.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async dismiss(id: string, db: PrismaClient): Promise<void> {
    await db.alert.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async resolve(id: string, db: PrismaClient): Promise<void> {
    await db.alert.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
  }

  async batchMarkRead(ids: string[], db: PrismaClient): Promise<void> {
    await db.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async batchDismiss(ids: string[], db: PrismaClient): Promise<void> {
    await db.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async getAlerts(
    filters: AlertFilters,
    db: PrismaClient,
  ): Promise<{ alerts: Alert[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.type) where.type = filters.type;
    if (filters.since) where.createdAt = { gte: new Date(filters.since) };

    const [alerts, total] = await Promise.all([
      db.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.alert.count({ where }),
    ]);

    return { alerts: alerts as unknown as Alert[], total, page, limit };
  }

  async getById(id: string, db: PrismaClient): Promise<Alert | null> {
    const alert = await db.alert.findUnique({ where: { id } });
    return alert as unknown as Alert | null;
  }

  async getUnreadCount(db: PrismaClient): Promise<number> {
    return db.alert.count({ where: { status: 'ACTIVE' } });
  }
}

export const alertManager = new AlertManager();
