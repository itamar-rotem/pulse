import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { rulesRouter } from './routes/rules.js';
import { alertsRouter } from './routes/alerts.js';
import { insightsRouter } from './routes/insights.js';
import { webhooksRouter } from './routes/webhooks.js';
import { authMiddleware } from './middleware/auth.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/sessions', authMiddleware, sessionsRouter);
  app.use('/api/dashboard', authMiddleware, dashboardRouter);
  app.use('/api/rules', authMiddleware, rulesRouter);
  app.use('/api/alerts', authMiddleware, alertsRouter);
  app.use('/api/insights', authMiddleware, insightsRouter);
  app.use('/api/webhooks', authMiddleware, webhooksRouter);

  return app;
}
