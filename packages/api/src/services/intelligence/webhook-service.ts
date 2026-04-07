import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import type { Alert } from '@pulse/shared';

const prisma = new PrismaClient();

const MAX_FAIL_COUNT = 5;

class WebhookService {
  async dispatch(alert: Alert): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        enabled: true,
        events: { has: alert.type },
      },
    });

    await Promise.allSettled(
      webhooks.map((wh) => this.deliver(wh, alert)),
    );
  }

  private async deliver(
    webhook: { id: string; url: string; secret: string | null; failCount: number },
    alert: Alert,
  ): Promise<void> {
    const payload = JSON.stringify({
      event: alert.type,
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metadata: alert.metadata,
      },
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
      headers['X-Pulse-Signature'] = signature;
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastSentAt: new Date(), failCount: 0, lastError: null },
      });
    } catch (err) {
      const newFailCount = webhook.failCount + 1;
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          failCount: { increment: 1 },
          lastError: (err as Error).message,
          ...(newFailCount >= MAX_FAIL_COUNT ? { enabled: false } : {}),
        },
      });
    }
  }

  async test(webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) return { success: false, error: 'Webhook not found' };

    const payload = JSON.stringify({
      event: 'TEST',
      alert: {
        id: 'test',
        type: 'SYSTEM',
        severity: 'INFO',
        title: 'Webhook test',
        message: 'This is a test payload from Pulse',
        metadata: {},
      },
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhook.secret) {
      headers['X-Pulse-Signature'] = createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      return { success: res.ok, statusCode: res.status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const webhookService = new WebhookService();
