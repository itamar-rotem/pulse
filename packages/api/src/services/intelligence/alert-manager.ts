import { PrismaClient, Prisma } from '@prisma/client';
import { publishAlert } from '../redis.js';
import { webhookService } from './webhook-service.js';
import type { CreateAlertInput, AlertFilters, Alert } from '@pulse/shared';

const prisma = new PrismaClient();

class AlertManager {
  async create(input: CreateAlertInput): Promise<Alert> {
    const alert = await prisma.alert.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        sessionId: input.sessionId ?? null,
        ruleId: input.ruleId ?? null,
        insightId: input.insightId ?? null,
      },
    });

    // Update rule trigger stats if this is a rule breach
    if (input.ruleId) {
      await prisma.rule.update({
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
    void Promise.resolve(webhookService.dispatch(alert as unknown as Alert)).catch(() => {});

    return alert as unknown as Alert;
  }

  async markRead(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async dismiss(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async resolve(id: string): Promise<void> {
    await prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
  }

  async batchMarkRead(ids: string[]): Promise<void> {
    await prisma.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async batchDismiss(ids: string[]): Promise<void> {
    await prisma.alert.updateMany({
      where: { id: { in: ids } },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async getAlerts(filters: AlertFilters): Promise<{ alerts: Alert[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.type) where.type = filters.type;
    if (filters.since) where.createdAt = { gte: new Date(filters.since) };

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where }),
    ]);

    return { alerts: alerts as unknown as Alert[], total, page, limit };
  }

  async getById(id: string): Promise<Alert | null> {
    const alert = await prisma.alert.findUnique({ where: { id } });
    return alert as unknown as Alert | null;
  }

  async getUnreadCount(): Promise<number> {
    return prisma.alert.count({ where: { status: 'ACTIVE' } });
  }
}

export const alertManager = new AlertManager();
