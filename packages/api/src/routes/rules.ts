import { Router, IRouter } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const rulesRouter: IRouter = Router();

rulesRouter.get('/', async (_req, res) => {
  try {
    const rules = await prisma.rule.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.get('/:id', async (req, res) => {
  try {
    const rule = await prisma.rule.findUnique({ where: { id: req.params.id } });
    if (!rule) { res.status(404).json({ error: 'Rule not found' }); return; }
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.post('/', async (req, res) => {
  try {
    const rule = await prisma.rule.create({ data: req.body });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.put('/:id', async (req, res) => {
  try {
    const rule = await prisma.rule.update({ where: { id: req.params.id }, data: req.body });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.rule.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.post('/:id/toggle', async (req, res) => {
  try {
    const rule = await prisma.rule.findUnique({ where: { id: req.params.id } });
    if (!rule) { res.status(404).json({ error: 'Rule not found' }); return; }
    const updated = await prisma.rule.update({
      where: { id: req.params.id },
      data: { enabled: !rule.enabled },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
