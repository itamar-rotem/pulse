import { Router, IRouter } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { requireRole } from '../middleware/require-role.js';

export const apiKeysRouter: IRouter = Router();

// All API key operations require OWNER or ADMIN
apiKeysRouter.use(requireRole('OWNER', 'ADMIN'));

apiKeysRouter.get('/', async (req, res) => {
  try {
    const keys = await req.prisma!.apiKey.findMany({
      where: { revokedAt: null },
      select: {
        id: true,
        prefix: true,
        name: true,
        createdBy: { select: { email: true, name: true } },
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiKeysRouter.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required (string)' });
      return;
    }

    // Generate key: pk_live_ + 32 random hex chars
    const rawKey = `pk_live_${randomBytes(16).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const apiKey = await req.prisma!.apiKey.create({
      data: {
        name,
        prefix,
        keyHash,
        createdById: req.auth!.userId!,
      } as any, // orgId auto-injected by tenant extension
    });

    res.status(201).json({
      id: apiKey.id,
      key: rawKey,
      prefix,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiKeysRouter.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    await req.prisma!.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
