import express, { Router, IRouter } from 'express';
import { Webhook } from 'svix';
import { prisma } from '../services/prisma.js';

export const clerkWebhookRouter: IRouter = Router();

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || '';

clerkWebhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    const payload = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    }) as any;

    const { type, data } = payload;

    switch (type) {
      case 'organization.created':
        await prisma.organization.create({
          data: {
            clerkOrgId: data.id,
            name: data.name,
            slug: data.slug,
          },
        });
        break;

      case 'organization.updated':
        await prisma.organization.update({
          where: { clerkOrgId: data.id },
          data: { name: data.name, slug: data.slug },
        });
        break;

      case 'organizationMembership.created': {
        const org = await prisma.organization.findUnique({
          where: { clerkOrgId: data.organization.id },
        });
        if (!org) break;

        const role = mapClerkRole(data.role);
        await prisma.user.upsert({
          where: { clerkUserId: data.public_user_data.user_id },
          update: { orgId: org.id, role },
          create: {
            clerkUserId: data.public_user_data.user_id,
            email: data.public_user_data.email_address || '',
            name: data.public_user_data.first_name || undefined,
            orgId: org.id,
            role,
          },
        });
        break;
      }

      case 'organizationMembership.updated': {
        const role = mapClerkRole(data.role);
        await prisma.user.update({
          where: { clerkUserId: data.public_user_data.user_id },
          data: { role },
        });
        break;
      }

      case 'organizationMembership.deleted':
        await prisma.user
          .delete({
            where: { clerkUserId: data.public_user_data.user_id },
          })
          .catch(() => {}); // Ignore if not found
        break;

      case 'user.updated':
        await prisma.user
          .update({
            where: { clerkUserId: data.id },
            data: {
              email: data.email_addresses?.[0]?.email_address,
              name:
                [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined,
            },
          })
          .catch(() => {}); // Ignore if user not found
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Clerk webhook error:', err);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

function mapClerkRole(clerkRole: string): 'OWNER' | 'ADMIN' | 'MEMBER' {
  if (clerkRole === 'admin' || clerkRole === 'org:admin') return 'OWNER';
  // Clerk's default member role
  return 'MEMBER';
}
