import { Router, IRouter } from 'express';
import { alertManager } from '../services/intelligence/alert-manager.js';

export const alertsRouter: IRouter = Router();

alertsRouter.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      type: req.query.type as string | undefined,
      since: req.query.since as string | undefined,
      projectId: req.query.projectId as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await alertManager.getAlerts(filters as any, req.prisma!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// IMPORTANT: /unread-count must be registered before /:id to avoid Express capturing "unread-count" as an id param
alertsRouter.get('/unread-count', async (req, res) => {
  try {
    const count = await alertManager.getUnreadCount(req.prisma!);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// IMPORTANT: /batch/* must be registered before /:id/* to avoid Express capturing "batch" as an id param
alertsRouter.put('/batch/read', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of strings' }); return;
    }
    await alertManager.batchMarkRead(ids, req.prisma!);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/batch/dismiss', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array of strings' }); return;
    }
    await alertManager.batchDismiss(ids, req.prisma!);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.get('/:id', async (req, res) => {
  try {
    const alert = await alertManager.getById(req.params.id, req.prisma!);
    if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/read', async (req, res) => {
  try {
    await alertManager.markRead(req.params.id, req.prisma!);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/dismiss', async (req, res) => {
  try {
    await alertManager.dismiss(req.params.id, req.prisma!);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

alertsRouter.put('/:id/resolve', async (req, res) => {
  try {
    await alertManager.resolve(req.params.id, req.prisma!);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
