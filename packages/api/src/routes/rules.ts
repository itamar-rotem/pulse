import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';
import type { RuleType, RuleAction } from '@pulse/shared';

export const rulesRouter: IRouter = Router();

const VALID_RULE_TYPES: RuleType[] = [
  'COST_CAP_SESSION', 'COST_CAP_DAILY', 'COST_CAP_PROJECT',
  'MODEL_RESTRICTION', 'BURN_RATE_LIMIT', 'SESSION_DURATION',
];
const VALID_RULE_ACTIONS: RuleAction[] = ['ALERT', 'PAUSE', 'BLOCK'];

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
    const { name, type, scope, condition, action } = req.body;

    if (!name || typeof name !== 'string') { res.status(400).json({ error: 'name is required (string)' }); return; }
    if (!VALID_RULE_TYPES.includes(type)) { res.status(400).json({ error: `type must be one of: ${VALID_RULE_TYPES.join(', ')}` }); return; }
    if (!scope || typeof scope !== 'object') { res.status(400).json({ error: 'scope is required (object)' }); return; }
    if (!condition || typeof condition !== 'object') { res.status(400).json({ error: 'condition is required (object)' }); return; }
    if (!VALID_RULE_ACTIONS.includes(action)) { res.status(400).json({ error: `action must be one of: ${VALID_RULE_ACTIONS.join(', ')}` }); return; }

    const rule = await prisma.rule.create({
      data: { name, type, scope, condition, action },
    });
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

rulesRouter.put('/:id', async (req, res) => {
  try {
    const { name, type, scope, condition, action } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string') { res.status(400).json({ error: 'name must be a string' }); return; }
      data.name = name;
    }
    if (type !== undefined) {
      if (!VALID_RULE_TYPES.includes(type)) { res.status(400).json({ error: `type must be one of: ${VALID_RULE_TYPES.join(', ')}` }); return; }
      data.type = type;
    }
    if (scope !== undefined) {
      if (typeof scope !== 'object') { res.status(400).json({ error: 'scope must be an object' }); return; }
      data.scope = scope;
    }
    if (condition !== undefined) {
      if (typeof condition !== 'object') { res.status(400).json({ error: 'condition must be an object' }); return; }
      data.condition = condition;
    }
    if (action !== undefined) {
      if (!VALID_RULE_ACTIONS.includes(action)) { res.status(400).json({ error: `action must be one of: ${VALID_RULE_ACTIONS.join(', ')}` }); return; }
      data.action = action;
    }

    const rule = await prisma.rule.update({ where: { id: req.params.id }, data });
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
