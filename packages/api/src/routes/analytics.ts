import { Router, IRouter } from 'express';
import {
  getCostTrends,
  getCostBreakdown,
  getBudgetStatus,
  getSessionsForExport,
} from '../services/analytics-service.js';

export const analyticsRouter: IRouter = Router();

/**
 * GET /api/analytics/cost-trends?granularity=day|week|month&days=30&projectId=
 *
 * Returns time-series cost + session data for charting.
 */
analyticsRouter.get('/cost-trends', async (req, res) => {
  try {
    const granularity = (['day', 'week', 'month'].includes(req.query.granularity as string)
      ? req.query.granularity
      : 'day') as 'day' | 'week' | 'month';
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const projectId = req.query.projectId as string | undefined;

    const trends = await getCostTrends(req.prisma!, { granularity, days, projectId });
    res.json({ trends, granularity, days });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/breakdown?groupBy=project|model|sessionType&days=30&projectId=
 *
 * Returns cost breakdown grouped by the specified dimension.
 */
analyticsRouter.get('/breakdown', async (req, res) => {
  try {
    const groupBy = (['project', 'model', 'sessionType'].includes(req.query.groupBy as string)
      ? req.query.groupBy
      : 'project') as 'project' | 'model' | 'sessionType';
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const projectId = req.query.projectId as string | undefined;

    const breakdown = await getCostBreakdown(req.prisma!, { groupBy, days, projectId });
    res.json({ breakdown, groupBy, days });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/budget-status
 *
 * Returns budget vs actual for all active projects.
 */
analyticsRouter.get('/budget-status', async (req, res) => {
  try {
    const items = await getBudgetStatus(req.prisma!);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/analytics/export?days=30&projectId=&format=csv
 *
 * Returns session data as CSV for download.
 */
analyticsRouter.get('/export', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const projectId = req.query.projectId as string | undefined;

    const rows = await getSessionsForExport(req.prisma!, { days, projectId });

    if (rows.length === 0) {
      res.status(204).end();
      return;
    }

    // Build CSV
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val == null) return '';
            const str = String(val);
            // Escape commas and quotes
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(','),
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pulse-sessions-${days}d.csv`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
