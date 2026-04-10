import type { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/express';
import bcrypt from 'bcrypt';
import { prisma } from '../services/prisma.js';

const DEFAULT_ORG_ID = 'org_default_seed';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Path 1: Org-scoped API key
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const resolved = await resolveApiKey(apiKeyHeader);
      if (resolved) {
        req.auth = resolved;
        return next();
      }

      // Legacy fallback: env-var API key → seed org
      // Read env var at request time (not module load) so tests that set
      // process.env.AGENT_API_KEY after import still work.
      const legacyKey = process.env.AGENT_API_KEY;
      if (legacyKey && apiKeyHeader === legacyKey) {
        console.warn('Legacy AGENT_API_KEY used — migrate to org-scoped API keys');
        req.auth = { orgId: DEFAULT_ORG_ID, role: 'ADMIN' };
        return next();
      }

      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Path 2: Clerk Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const resolved = await resolveClerkToken(token);
      if (resolved) {
        req.auth = resolved;
        return next();
      }
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    res.status(401).json({ error: 'Unauthorized — provide x-api-key or Bearer token' });
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function resolveApiKey(
  rawKey: string,
): Promise<{ orgId: string; userId?: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } | null> {
  const prefix = rawKey.slice(0, 12);
  const apiKey = await prisma.apiKey.findFirst({
    where: { prefix, revokedAt: null },
  });
  if (!apiKey) return null;

  const valid = await bcrypt.compare(rawKey, apiKey.keyHash);
  if (!valid) return null;

  // Update lastUsedAt (fire-and-forget)
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // API keys authenticate as ADMIN by default
  return { orgId: apiKey.orgId, role: 'ADMIN' };
}

async function resolveClerkToken(
  token: string,
): Promise<{ orgId: string; userId?: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } | null> {
  try {
    const payload = await clerkClient.verifyToken(token);
    if (!payload.org_id) return null;

    // Look up our local org by Clerk org ID
    const org = await prisma.organization.findUnique({
      where: { clerkOrgId: payload.org_id },
    });
    if (!org) return null;

    // Map Clerk role to our Role enum
    const clerkRole = payload.org_role as string;
    let role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER';
    if (clerkRole === 'org:admin') role = 'ADMIN';
    if (clerkRole === 'org:owner' || clerkRole === 'admin') role = 'OWNER';

    // Upsert user record and update lastSeenAt
    const userId = payload.sub;
    if (userId) {
      prisma.user.upsert({
        where: { clerkUserId: userId },
        update: { lastSeenAt: new Date(), role },
        create: {
          clerkUserId: userId,
          email: (payload as any).email || '',
          orgId: org.id,
          role,
        },
      }).catch(() => {});
    }

    return { orgId: org.id, userId, role };
  } catch {
    return null;
  }
}
