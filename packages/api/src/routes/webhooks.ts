import { Router, IRouter } from 'express';
import { webhookService } from '../services/intelligence/webhook-service.js';
import { prisma } from '../services/prisma.js';
export const webhooksRouter: IRouter = Router();

webhooksRouter.get('/', async (_req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
    // Omit secrets from response
    res.json(webhooks.map((w) => ({ ...w, secret: w.secret ? '***' : null })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.get('/:id', async (req, res) => {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!webhook) { res.status(404).json({ error: 'Webhook not found' }); return; }
    res.json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/', async (req, res) => {
  try {
    const webhook = await prisma.webhook.create({ data: req.body });
    res.status(201).json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.put('/:id', async (req, res) => {
  try {
    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: req.body });
    res.json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/:id/test', async (req, res) => {
  try {
    const result = await webhookService.test(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.post('/:id/enable', async (req, res) => {
  try {
    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: { enabled: true, failCount: 0 },
    });
    res.json(webhook);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
