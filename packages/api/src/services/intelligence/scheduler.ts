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

    // Every midnight UTC: reset daily cost counter
    this.intervals.push(
      setInterval(() => {
        const now = new Date();
        if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
          redis.del('pulse:daily_cost').catch(() => {});
        }
      }, 60_000),
    );

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
