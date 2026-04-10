import { Router, IRouter } from 'express';
import { prisma } from '../services/prisma.js';

export const setupRouter: IRouter = Router();

const DEFAULT_ORG_ID = 'org_default_seed';

setupRouter.post('/claim', async (req, res) => {
  try {
    if (!req.auth?.orgId) {
      res.status(401).json({ error: 'Must be authenticated with a Clerk org' });
      return;
    }

    // Check if seed org exists and is unclaimed
    const seedOrg = await prisma.organization.findUnique({
      where: { id: DEFAULT_ORG_ID },
    });

    if (!seedOrg) {
      res.status(404).json({ error: 'No seed organization to claim' });
      return;
    }

    if (seedOrg.clerkOrgId) {
      res.status(409).json({ error: 'Seed organization already claimed' });
      return;
    }

    // Link the seed org to the authenticated Clerk org
    await prisma.organization.update({
      where: { id: DEFAULT_ORG_ID },
      data: { clerkOrgId: req.auth.orgId },
    });

    res.json({ claimed: true, orgId: DEFAULT_ORG_ID });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
