import type { Request, Response, NextFunction } from 'express';
import { createTenantPrisma } from '../services/tenant-prisma.js';

export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth?.orgId) {
    res.status(401).json({ error: 'No tenant context' });
    return;
  }

  req.prisma = createTenantPrisma(req.auth.orgId);
  next();
}
