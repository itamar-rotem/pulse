import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_ORG_ID = 'org_default_seed';

async function main() {
  // Create the default organization if it doesn't exist
  const org = await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: 'Personal',
      slug: 'personal',
      plan: 'FREE',
    },
  });
  console.log(`Default org: ${org.id} (${org.name})`);

  // Assign all existing rows to the default org
  const tables = ['session', 'tokenEvent', 'rule', 'alert', 'insight', 'webhook'] as const;

  for (const table of tables) {
    const result = await (prisma as any)[table].updateMany({
      where: { orgId: null },
      data: { orgId: DEFAULT_ORG_ID },
    });
    console.log(`  ${table}: ${result.count} rows assigned`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
