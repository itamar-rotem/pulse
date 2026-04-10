import { Router, IRouter } from 'express';
import { requireRole } from '../middleware/require-role.js';
import { insightGenerator } from '../services/intelligence/insight-generator.js';
export const insightsRouter: IRouter = Router();

insightsRouter.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.status) where.status = req.query.status;

    const [insights, total] = await Promise.all([
      req.prisma!.insight.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      req.prisma!.insight.count({ where }),
    ]);

    res.json({ insights, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.get('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const insight = await req.prisma!.insight.findUnique({ where: { id } });
    if (!insight) { res.status(404).json({ error: 'Insight not found' }); return; }
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.put('/:id/dismiss', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const insight = await req.prisma!.insight.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

insightsRouter.put('/:id/apply', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const result = await insightGenerator.applyInsight(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
