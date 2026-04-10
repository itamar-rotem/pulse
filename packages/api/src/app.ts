import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { rulesRouter } from './routes/rules.js';
import { alertsRouter } from './routes/alerts.js';
import { insightsRouter } from './routes/insights.js';
import { webhooksRouter } from './routes/webhooks.js';
// TODO (Task 8): import { apiKeysRouter } from './routes/api-keys.js';
// TODO (Task 9): import { clerkWebhookRouter } from './routes/clerk-webhook.js';
// TODO (Task 9): import { setupRouter } from './routes/setup.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Public routes
  app.use('/api/health', healthRouter);
  // TODO (Task 9): app.use('/api/clerk/webhook', clerkWebhookRouter);

  // Auth + tenant scoped routes
  // TODO (Task 9): app.use('/api/setup', authMiddleware, setupRouter);
  app.use('/api/sessions', authMiddleware, tenantMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, tenantMiddleware, dashboardRouter);
  app.use('/api/rules', authMiddleware, tenantMiddleware, rulesRouter);
  app.use('/api/alerts', authMiddleware, tenantMiddleware, alertsRouter);
  app.use('/api/insights', authMiddleware, tenantMiddleware, insightsRouter);
  app.use('/api/webhooks', authMiddleware, tenantMiddleware, webhooksRouter);
  // TODO (Task 8): app.use('/api/api-keys', authMiddleware, tenantMiddleware, apiKeysRouter);

  return app;
}
