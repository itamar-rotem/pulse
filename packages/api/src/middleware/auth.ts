import type { Request, Response, NextFunction } from 'express';

const AGENT_API_KEY = process.env.AGENT_API_KEY || 'dev-agent-key-change-in-production';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;

  if (apiKey === AGENT_API_KEY) {
    next();
    return;
  }

  if (authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
