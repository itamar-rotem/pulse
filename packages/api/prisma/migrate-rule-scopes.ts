import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.rule.findMany({
    where: { type: 'COST_CAP_PROJECT' },
  });
  console.log(`Found ${rules.length} COST_CAP_PROJECT rules`);

  let migrated = 0;
  let orphaned = 0;
  let skipped = 0;

  for (const rule of rules) {
    const scope = rule.scope as { projectName?: string; projectId?: string; [k: string]: unknown };
    if (scope.projectId) { skipped++; continue; }
    if (!scope.projectName) { skipped++; continue; }

    const project = await prisma.project.findUnique({
      where: { orgId_slug: { orgId: rule.orgId, slug: scope.projectName } },
    });

    if (!project) {
      console.warn(`  rule ${rule.id}: orphan projectName="${scope.projectName}" in org ${rule.orgId} — disabling`);
      await prisma.rule.update({
        where: { id: rule.id },
        data: {
          enabled: false,
          scope: { ...scope, _migrationNote: 'orphaned-projectName' } as any,
        },
      });
      orphaned++;
      continue;
    }

    await prisma.rule.update({
      where: { id: rule.id },
      data: { scope: { projectId: project.id } as any },
    });
    migrated++;
  }

  console.log(`Done. migrated=${migrated} orphaned=${orphaned} skipped=${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
