import { Router, IRouter } from 'express';
import { requireRole } from '../middleware/require-role.js';
import {
  validateSlug,
  syncBudgetRule,
  disableBudgetRule,
} from '../services/project-service.js';

export const projectsRouter: IRouter = Router();

// GET /api/projects?status=active|archived|all&q=&page=&limit=
projectsRouter.get('/', async (req, res) => {
  try {
    const status = (req.query.status as string) || 'active';
    const q = req.query.q as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const where: Record<string, unknown> = {};
    if (status === 'active') where.status = 'ACTIVE';
    else if (status === 'archived') where.status = 'ARCHIVED';
    if (q) {
      where.OR = [
        { slug: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      req.prisma!.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      req.prisma!.project.count({ where }),
    ]);

    res.json({ projects, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/projects/:id — includes 30d cost + session count aggregates
projectsRouter.get('/:id', async (req, res) => {
  try {
    const project = await req.prisma!.project.findUnique({
      where: { id: req.params.id as string },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [sessionAgg, activeCount] = await Promise.all([
      req.prisma!.session.aggregate({
        where: { projectId: project.id, startedAt: { gte: thirtyDaysAgo } },
        _count: true,
        _sum: { costUsd: true },
      }),
      req.prisma!.session.count({
        where: { projectId: project.id, endedAt: null },
      }),
    ]);

    res.json({
      ...project,
      stats: {
        sessions30d: sessionAgg._count,
        cost30d: sessionAgg._sum.costUsd ?? 0,
        activeSessions: activeCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/projects
projectsRouter.post('/', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { slug, name, description, color, icon, monthlyBudgetUsd } = req.body;
    if (!slug || typeof slug !== 'string' || !validateSlug(slug)) {
      res
        .status(400)
        .json({ error: 'slug required and must match /^[a-z0-9][a-z0-9-_]{0,63}$/' });
      return;
    }

    const created = await req.prisma!.project.create({
      data: {
        slug,
        name: name || slug,
        description: description ?? null,
        color: color ?? null,
        icon: icon ?? null,
        monthlyBudgetUsd:
          typeof monthlyBudgetUsd === 'number' ? monthlyBudgetUsd : null,
        status: 'ACTIVE',
      } as any,
    });

    if (typeof monthlyBudgetUsd === 'number' && monthlyBudgetUsd > 0) {
      await syncBudgetRule(
        req.auth!.orgId,
        created.id,
        created.name,
        monthlyBudgetUsd,
        req.prisma!,
      );
    }

    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Unique constraint')) {
      res
        .status(409)
        .json({ error: 'A project with that slug already exists in this organization' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/projects/:id
projectsRouter.patch('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    if ('slug' in req.body) {
      res
        .status(400)
        .json({ error: 'slug is immutable. Create a new project to change the slug.' });
      return;
    }

    const { name, description, color, icon, monthlyBudgetUsd, status, metadata } =
      req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (color !== undefined) data.color = color;
    if (icon !== undefined) data.icon = icon;
    if (monthlyBudgetUsd !== undefined) data.monthlyBudgetUsd = monthlyBudgetUsd;
    if (metadata !== undefined) data.metadata = metadata;
    if (status !== undefined) {
      data.status = status;
      data.archivedAt = status === 'ARCHIVED' ? new Date() : null;
    }

    const updated = await req.prisma!.project.update({
      where: { id: req.params.id as string },
      data,
    });

    if (monthlyBudgetUsd !== undefined) {
      await syncBudgetRule(
        req.auth!.orgId,
        updated.id,
        updated.name,
        typeof monthlyBudgetUsd === 'number' ? monthlyBudgetUsd : null,
        req.prisma!,
      );
    }
    if (status === 'ARCHIVED') {
      await disableBudgetRule(updated.id, req.prisma!);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/projects/:id (soft delete → archive)
projectsRouter.delete('/:id', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const updated = await req.prisma!.project.update({
      where: { id: req.params.id as string },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await disableBudgetRule(updated.id, req.prisma!);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/projects/:id/restore
projectsRouter.post('/:id/restore', requireRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const updated = await req.prisma!.project.update({
      where: { id: req.params.id as string },
      data: { status: 'ACTIVE', archivedAt: null },
    });

    // Re-materialize the budget rule that DELETE/archive disabled, so that
    // archive → restore does not silently leave budget caps off.
    if (
      typeof (updated as { monthlyBudgetUsd?: number | null }).monthlyBudgetUsd === 'number' &&
      ((updated as { monthlyBudgetUsd: number }).monthlyBudgetUsd) > 0
    ) {
      await syncBudgetRule(
        req.auth!.orgId,
        updated.id,
        updated.name,
        (updated as { monthlyBudgetUsd: number }).monthlyBudgetUsd,
        req.prisma!,
      );
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
