import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';
import { webhookService } from '../services/intelligence/webhook-service.js';
import type { AlertType } from '@pulse/shared';

export const webhooksRouter: IRouter = Router();

const VALID_EVENT_TYPES: AlertType[] = ['RULE_BREACH', 'ANOMALY', 'INSIGHT', 'SYSTEM'];

webhooksRouter.get('/', async (_req, res) => {
  try {
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
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
    const { name, url, events, secret } = req.body;

    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name is required (string)' }); return; }
    if (!url || typeof url !== 'string') { res.status(400).json({ error: 'url is required (string)' }); return; }
    try { new URL(url); } catch { res.status(400).json({ error: 'url must be a valid URL' }); return; }
    if (!Array.isArray(events) || events.length === 0) { res.status(400).json({ error: 'events must be a non-empty array' }); return; }
    if (!events.every((e: string) => VALID_EVENT_TYPES.includes(e as AlertType))) {
      res.status(400).json({ error: `events must contain only: ${VALID_EVENT_TYPES.join(', ')}` }); return;
    }

    const data: Record<string, unknown> = { name, url, events };
    if (secret && typeof secret === 'string') data.secret = secret;

    const webhook = await prisma.webhook.create({ data: data as any });
    res.status(201).json({ ...webhook, secret: webhook.secret ? '***' : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

webhooksRouter.put('/:id', async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string') { res.status(400).json({ error: 'name must be a string' }); return; }
      data.name = name;
    }
    if (url !== undefined) {
      if (typeof url !== 'string') { res.status(400).json({ error: 'url must be a string' }); return; }
      try { new URL(url); } catch { res.status(400).json({ error: 'url must be a valid URL' }); return; }
      data.url = url;
    }
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) { res.status(400).json({ error: 'events must be a non-empty array' }); return; }
      if (!events.every((e: string) => VALID_EVENT_TYPES.includes(e as AlertType))) {
        res.status(400).json({ error: `events must contain only: ${VALID_EVENT_TYPES.join(', ')}` }); return;
      }
      data.events = events;
    }
    if (secret !== undefined) {
      if (typeof secret !== 'string') { res.status(400).json({ error: 'secret must be a string' }); return; }
      data.secret = secret;
    }

    const webhook = await prisma.webhook.update({ where: { id: req.params.id }, data: data as any });
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
