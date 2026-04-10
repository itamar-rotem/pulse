import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { rulesRouter } from './routes/rules.js';
import { alertsRouter } from './routes/alerts.js';
import { insightsRouter } from './routes/insights.js';
import { webhooksRouter } from './routes/webhooks.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { clerkWebhookRouter } from './routes/clerk-webhook.js';
import { setupRouter } from './routes/setup.js';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());

  // Clerk webhook MUST be mounted before express.json() so its inline
  // express.raw() middleware can parse the raw body for Svix signature
  // verification. (Public route — Svix signature is the auth.)
  app.use('/api/clerk/webhook', clerkWebhookRouter);

  app.use(express.json());

  // Public routes
  app.use('/api/health', healthRouter);

  // Auth + tenant scoped routes
  app.use('/api/setup', authMiddleware, setupRouter);
  app.use('/api/sessions', authMiddleware, tenantMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, tenantMiddleware, dashboardRouter);
  app.use('/api/rules', authMiddleware, tenantMiddleware, rulesRouter);
  app.use('/api/alerts', authMiddleware, tenantMiddleware, alertsRouter);
  app.use('/api/insights', authMiddleware, tenantMiddleware, insightsRouter);
  app.use('/api/webhooks', authMiddleware, tenantMiddleware, webhooksRouter);
  app.use('/api/api-keys', authMiddleware, tenantMiddleware, apiKeysRouter);

  return app;
}
