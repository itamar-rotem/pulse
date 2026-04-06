import { Router, IRouter } from 'express';
import { getLiveSummary } from '../services/session-service.js';

export const dashboardRouter: IRouter = Router();

dashboardRouter.get('/live-summary', async (_req, res) => {
  try {
    const summary = await getLiveSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
