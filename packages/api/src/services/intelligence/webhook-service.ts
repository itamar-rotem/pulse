import { createHmac } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { Alert } from '@pulse/shared';

const MAX_FAIL_COUNT = 5;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s
const MAX_ATTEMPTS = 3;

class WebhookService {
  async dispatch(alert: Alert, db: PrismaClient): Promise<void> {
    const webhooks = await db.webhook.findMany({
      where: {
        enabled: true,
        events: { has: alert.type },
      },
    });

    for (const wh of webhooks) {
      // Fire-and-forget: don't await delivery
      this.deliverWithRetry(wh, alert, db).catch(() => {});
    }
  }

  private async deliverWithRetry(
    webhook: { id: string; url: string; secret: string | null; failCount: number },
    alert: Alert,
    db: PrismaClient,
  ): Promise<void> {
    const payload = this.buildPayload(alert);
    const headers = this.buildHeaders(payload, webhook.secret);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          // Success — reset failure tracking
          await db.webhook.update({
            where: { id: webhook.id },
            data: { lastSentAt: new Date(), failCount: 0, lastError: null },
          });
          return;
        }

        // 4xx = client error, don't retry
        if (res.status >= 400 && res.status < 500) {
          await this.recordFailure(webhook, `HTTP ${res.status}`, db);
          return;
        }

        // 5xx = server error, retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          await this.delay(RETRY_DELAYS[attempt - 1]);
          continue;
        }

        // Final attempt failed
        await this.recordFailure(webhook, `HTTP ${res.status}`, db);
      } catch (err) {
        // Network error — retry if attempts remain
        if (attempt < MAX_ATTEMPTS) {
          await this.delay(RETRY_DELAYS[attempt - 1]);
          continue;
        }

        // Final attempt failed
        await this.recordFailure(webhook, (err as Error).message, db);
      }
    }
  }

  private buildPayload(alert: Alert): string {
    return JSON.stringify({
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
  }

  private buildHeaders(payload: string, secret: string | null): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) {
      headers['X-Pulse-Signature'] = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    }
    return headers;
  }

  private async recordFailure(
    webhook: { id: string; failCount: number },
    error: string,
    db: PrismaClient,
  ): Promise<void> {
    const newFailCount = webhook.failCount + 1;
    await db.webhook.update({
      where: { id: webhook.id },
      data: {
        failCount: { increment: 1 },
        lastError: error,
        ...(newFailCount >= MAX_FAIL_COUNT ? { enabled: false } : {}),
      },
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async test(
    webhookId: string,
    db: PrismaClient,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
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
