import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Backfill: collecting distinct (orgId, projectSlug) pairs from Session...');
  const sessionPairs = await prisma.session.findMany({
    select: { orgId: true, projectSlug: true },
    distinct: ['orgId', 'projectSlug'],
  });
  console.log(`  found ${sessionPairs.length} distinct pairs in sessions`);

  console.log('Backfill: collecting distinct (orgId, projectSlug) pairs from TokenEvent...');
  const eventPairs = await prisma.tokenEvent.findMany({
    select: { orgId: true, projectSlug: true },
    distinct: ['orgId', 'projectSlug'],
  });
  console.log(`  found ${eventPairs.length} distinct pairs in token_events`);

  const seen = new Set<string>();
  const allPairs: Array<{ orgId: string; projectSlug: string }> = [];
  for (const p of [...sessionPairs, ...eventPairs]) {
    const key = `${p.orgId}::${p.projectSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allPairs.push(p);
  }
  console.log(`Backfill: ${allPairs.length} unique (org, slug) pairs to upsert`);

  let created = 0;
  for (const { orgId, projectSlug } of allPairs) {
    const result = await prisma.project.upsert({
      where: { orgId_slug: { orgId, slug: projectSlug } },
      update: {},
      create: {
        orgId,
        slug: projectSlug,
        name: projectSlug,
        status: 'ACTIVE',
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
  }
  console.log(`Backfill: upserted projects (${created} newly created)`);

  console.log('Backfill: setting sessions.project_id from matching project...');
  const sessionsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE sessions
    SET project_id = projects.id
    FROM projects
    WHERE sessions.org_id = projects.org_id
      AND sessions.project_slug = projects.slug
      AND sessions.project_id IS NULL;
  `);
  console.log(`  updated ${sessionsUpdated} sessions`);

  console.log('Backfill: setting token_events.project_id from matching project...');
  const eventsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE token_events
    SET project_id = projects.id
    FROM projects
    WHERE token_events.org_id = projects.org_id
      AND token_events.project_slug = projects.slug
      AND token_events.project_id IS NULL;
  `);
  console.log(`  updated ${eventsUpdated} token events`);

  const remainingSessions = await prisma.session.count({ where: { projectId: null } });
  const remainingEvents = await prisma.tokenEvent.count({ where: { projectId: null } });
  console.log(`Verification: sessions with null projectId = ${remainingSessions}`);
  console.log(`Verification: token_events with null projectId = ${remainingEvents}`);

  if (remainingSessions > 0 || remainingEvents > 0) {
    console.error('FAIL: backfill did not cover all rows. Investigate before proceeding to Task 3.');
    process.exit(1);
  }
  console.log('Backfill complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
