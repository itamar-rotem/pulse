import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_ID = 'org_default_seed';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('Seeding demo data...');

  // Verify org exists
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) {
    console.error('Run seed-default-org.ts first');
    process.exit(1);
  }

  // Create projects
  const projects = await Promise.all([
    prisma.project.upsert({
      where: { orgId_slug: { orgId: ORG_ID, slug: 'pulse' } },
      update: {},
      create: {
        orgId: ORG_ID,
        slug: 'pulse',
        name: 'Pulse',
        description: 'AI Dev Health Monitor',
        color: '#ff6b35',
        monthlyBudgetUsd: 200,
      },
    }),
    prisma.project.upsert({
      where: { orgId_slug: { orgId: ORG_ID, slug: 'signal-stocks' } },
      update: {},
      create: {
        orgId: ORG_ID,
        slug: 'signal-stocks',
        name: 'SignalStocks',
        description: 'AI-Powered Stock Screener',
        color: '#3b82f6',
        monthlyBudgetUsd: 150,
      },
    }),
    prisma.project.upsert({
      where: { orgId_slug: { orgId: ORG_ID, slug: 'visapath' } },
      update: {},
      create: {
        orgId: ORG_ID,
        slug: 'visapath',
        name: 'VisaPath',
        description: 'Immigration Navigator',
        color: '#10b981',
        monthlyBudgetUsd: 100,
      },
    }),
  ]);

  console.log(`  Projects: ${projects.map((p) => p.name).join(', ')}`);

  // Create sessions spread over the last 7 days
  const users = ['Itamar', 'Claude Agent', 'Itamar', 'Itamar'];
  const models = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514'];
  const sessionTypes = ['human', 'agent_local', 'human'];

  let totalSessions = 0;
  let totalEvents = 0;

  for (let day = 0; day < 7; day++) {
    const sessionsPerDay = randomBetween(3, 8);
    for (let s = 0; s < sessionsPerDay; s++) {
      const project = projects[randomBetween(0, projects.length - 1)];
      const userIdx = randomBetween(0, users.length - 1);
      const modelIdx = randomBetween(0, models.length - 1);
      const startHour = randomBetween(8, 22);
      const durationMins = randomBetween(5, 90);
      const startedAt = new Date(hoursAgo(day * 24 + (24 - startHour)));
      const endedAt = new Date(startedAt.getTime() + durationMins * 60 * 1000);
      const isEnded = day > 0 || endedAt < new Date();

      const inputTokens = randomBetween(5000, 200000);
      const outputTokens = randomBetween(2000, 80000);
      const cacheCreationTokens = randomBetween(0, inputTokens * 0.3);
      const cacheReadTokens = randomBetween(0, inputTokens * 0.5);

      // Cost calc (rough Sonnet pricing)
      const costUsd =
        (inputTokens * 3 + outputTokens * 15 + cacheCreationTokens * 3.75 + cacheReadTokens * 0.3) /
        1_000_000;

      const session = await prisma.session.create({
        data: {
          orgId: ORG_ID,
          projectId: project.id,
          tool: 'claude_code',
          projectSlug: project.slug,
          sessionType: sessionTypes[modelIdx],
          model: models[modelIdx],
          userName: users[userIdx],
          status: isEnded ? 'ENDED' : 'ACTIVE',
          startedAt,
          endedAt: isEnded ? endedAt : null,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          costUsd: Math.round(costUsd * 100) / 100,
        },
      });

      // Create 3-8 token events per session
      const eventCount = randomBetween(3, 8);
      let cumInput = 0;
      let cumOutput = 0;
      let cumCost = 0;

      for (let e = 0; e < eventCount; e++) {
        const fraction = (e + 1) / eventCount;
        const evInput = Math.round(inputTokens * fraction) - cumInput;
        const evOutput = Math.round(outputTokens * fraction) - cumOutput;
        const evCost =
          (evInput * 3 + evOutput * 15) / 1_000_000;
        cumInput += evInput;
        cumOutput += evOutput;
        cumCost += evCost;

        await prisma.tokenEvent.create({
          data: {
            sessionId: session.id,
            orgId: ORG_ID,
            projectId: project.id,
            timestamp: new Date(
              startedAt.getTime() + (durationMins * 60 * 1000 * (e + 1)) / eventCount,
            ),
            tool: 'claude_code',
            model: session.model,
            projectSlug: project.slug,
            sessionType: session.sessionType,
            inputTokens: evInput,
            outputTokens: evOutput,
            costDeltaUsd: Math.round(evCost * 10000) / 10000,
            cumulativeInputTokens: cumInput,
            cumulativeOutputTokens: cumOutput,
            cumulativeCostUsd: Math.round(cumCost * 10000) / 10000,
            burnRatePerMin: Math.round((evCost / (durationMins / eventCount)) * 10000) / 10000,
          },
        });
        totalEvents++;
      }

      totalSessions++;
    }
  }

  console.log(`  Sessions: ${totalSessions}`);
  console.log(`  Token events: ${totalEvents}`);

  // Create a few rules
  await prisma.rule.createMany({
    data: [
      {
        orgId: ORG_ID,
        name: 'Daily cost cap',
        type: 'COST_CAP_DAILY',
        scope: { projects: 'all' },
        condition: { maxCostUsd: 50 },
        action: 'ALERT',
        enabled: true,
      },
      {
        orgId: ORG_ID,
        name: 'Session cost warning',
        type: 'COST_CAP_SESSION',
        scope: { projects: 'all' },
        condition: { maxCostUsd: 5 },
        action: 'ALERT',
        enabled: true,
      },
      {
        orgId: ORG_ID,
        name: 'High burn rate',
        type: 'BURN_RATE_LIMIT',
        scope: { projects: 'all' },
        condition: { maxTokensPerMin: 50000 },
        action: 'ALERT',
        enabled: true,
      },
    ],
  });
  console.log('  Rules: 3');

  // Create some alerts
  const recentSessions = await prisma.session.findMany({
    where: { orgId: ORG_ID },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });

  await prisma.alert.createMany({
    data: [
      {
        orgId: ORG_ID,
        type: 'RULE_BREACH',
        severity: 'WARNING',
        title: 'Daily cost approaching limit',
        message: 'Today\'s spending has reached $42.50, approaching the $50 daily cap.',
        sessionId: recentSessions[0]?.id ?? null,
        createdAt: hoursAgo(2),
      },
      {
        orgId: ORG_ID,
        type: 'ANOMALY',
        severity: 'INFO',
        title: 'Unusual activity pattern detected',
        message: 'Token usage spiked 3x compared to your 7-day average during the last session.',
        sessionId: recentSessions[1]?.id ?? null,
        createdAt: hoursAgo(5),
      },
      {
        orgId: ORG_ID,
        type: 'RULE_BREACH',
        severity: 'CRITICAL',
        title: 'Session cost exceeded $5 threshold',
        message: 'Session on pulse project exceeded the $5 per-session limit with a total of $7.23.',
        sessionId: recentSessions[2]?.id ?? null,
        createdAt: hoursAgo(8),
      },
    ],
  });
  console.log('  Alerts: 3');

  // Create some insights
  await prisma.insight.createMany({
    data: [
      {
        orgId: ORG_ID,
        category: 'COST_OPTIMIZATION',
        title: 'Switch to Sonnet for routine tasks',
        description:
          '68% of your Opus sessions are code formatting and linting tasks. Switching these to Sonnet could save ~$35/week with similar quality.',
        impact: { estimatedSavings: 35 },
        metadata: { suggestedRule: { type: 'MODEL_RESTRICTION', model: 'claude-sonnet-4-20250514' } },
        dedupKey: 'cost-opt-model-switch-1',
      },
      {
        orgId: ORG_ID,
        category: 'USAGE_PATTERN',
        title: 'Peak usage: 2-4 PM',
        description:
          'Your highest token consumption is between 2-4 PM. Consider scheduling batch tasks for off-peak hours to spread costs.',
        impact: { percentChange: 45 },
        metadata: {},
        dedupKey: 'usage-pattern-peak-1',
      },
      {
        orgId: ORG_ID,
        category: 'ANOMALY_TREND',
        title: 'Cache hit ratio declining',
        description:
          'Your cache read ratio dropped from 42% to 18% over the past week. This suggests prompts are changing frequently, increasing effective cost.',
        impact: { percentChange: -57 },
        metadata: {},
        dedupKey: 'anomaly-cache-decline-1',
      },
    ],
  });
  console.log('  Insights: 3');

  console.log('Done! Refresh the dashboard to see data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
