import { Router, IRouter } from 'express';
import { getLiveSummary } from '../services/session-service.js';

export const dashboardRouter: IRouter = Router();

dashboardRouter.get('/live-summary', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const summary = await getLiveSummary(req.prisma!, { projectId });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
