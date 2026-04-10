import type { PrismaClient } from '@prisma/client';
import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        orgId: string;
        userId?: string;
        role: Role;
      };
      prisma?: PrismaClient;
    }
  }
}
