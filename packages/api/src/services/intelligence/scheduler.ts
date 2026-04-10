import cron, { type ScheduledTask } from 'node-cron';
import { ruleEngine } from './rule-engine.js';
import { anomalyDetector } from './anomaly-detector.js';
import { insightGenerator } from './insight-generator.js';
import { redis } from '../redis.js';

class Scheduler {
  private intervals: ReturnType<typeof setInterval>[] = [];
  private cronJobs: ScheduledTask[] = [];

  async start(): Promise<void> {
    // Load initial state
    await ruleEngine.refreshCache().catch((e) => console.warn('Initial rule cache failed:', e));
    await anomalyDetector.loadBaselines().catch((e) => console.warn('Baseline load failed:', e));

    // Every 60s: refresh rule cache
    this.intervals.push(
      setInterval(() => {
        ruleEngine.refreshCache().catch(() => {});
      }, 60_000),
    );

    // Every 60s: persist anomaly baselines
    this.intervals.push(
      setInterval(() => {
        anomalyDetector.persistBaselines().catch(() => {});
      }, 60_000),
    );

    // Every 5 min: run insight analysis
    this.intervals.push(
      setInterval(() => {
        insightGenerator.analyze().catch((e) => console.error('Insight analysis failed:', e));
      }, 5 * 60_000),
    );

    // Midnight UTC: reset daily cost counters for all orgs
    // TODO: migrate `redis.keys(...)` to `SCAN` once we cross ~1k orgs; see ws-server.ts
    //       project_cost key writers for the corresponding TTL belt-and-suspenders.
    const midnightJob = cron.schedule('0 0 * * *', async () => {
      try {
        const dailyKeys = await redis.keys('pulse:daily_cost:*');
        if (dailyKeys.length > 0) {
          await redis.del(...dailyKeys);
        }
        const projectDailyKeys = await redis.keys('pulse:project_cost:*:daily');
        if (projectDailyKeys.length > 0) {
          await redis.del(...projectDailyKeys);
        }
      } catch {
        // non-critical
      }
    }, { timezone: 'UTC' });
    this.cronJobs.push(midnightJob);

    // Sunday midnight UTC: reset weekly project cost counters
    const weeklyResetJob = cron.schedule('0 0 * * 0', async () => {
      try {
        const keys = await redis.keys('pulse:project_cost:*:weekly');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch {
        // non-critical
      }
    }, { timezone: 'UTC' });
    this.cronJobs.push(weeklyResetJob);

    // 1st of month, midnight UTC: reset monthly project cost counters
    const monthlyResetJob = cron.schedule('0 0 1 * *', async () => {
      try {
        const keys = await redis.keys('pulse:project_cost:*:monthly');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch {
        // non-critical
      }
    }, { timezone: 'UTC' });
    this.cronJobs.push(monthlyResetJob);

    // Sunday 9am UTC: weekly digest
    const weeklyJob = cron.schedule('0 9 * * 0', () => {
      insightGenerator.weeklyDigest().catch((e) => console.error('Weekly digest failed:', e));
    }, { timezone: 'UTC' });
    this.cronJobs.push(weeklyJob);

    console.log('Intelligence scheduler started');
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.cronJobs.forEach((j) => j.stop());
    this.cronJobs = [];
    console.log('Intelligence scheduler stopped');
  }
}

export const scheduler = new Scheduler();
