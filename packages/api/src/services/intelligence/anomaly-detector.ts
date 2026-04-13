import { redis } from '../redis.js';
import type { Anomaly, Severity } from '@pulse/shared';

interface RunningStats {
  burnRate: { mean: number; count: number };
}

interface SessionEventHistory {
  outputRatios: number[]; // last N output/(input+output) ratios
  recentCosts: number[];  // last 5 costDeltaUsd values
  cumulativeCost: number;
}

const EWMA_ALPHA = 0.1; // smoothing factor

class AnomalyDetector {
  private baselineStats = new Map<string, RunningStats>();
  private sessionHistory = new Map<string, SessionEventHistory>();
  private abnormalTerminations: { timestamp: number; sessionId: string }[] = [];

  async check(
    event: { sessionId: string; burnRatePerMin: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costDeltaUsd?: number; cumulativeCostUsd?: number },
    session: { id: string; sessionType: string },
  ): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Update session event history
    const history = this.getSessionHistory(event.sessionId);
    const totalTokens = event.inputTokens + event.outputTokens;
    const outputRatio = totalTokens > 0 ? event.outputTokens / totalTokens : 0;
    history.outputRatios.push(outputRatio);
    if (history.outputRatios.length > 10) history.outputRatios.shift();

    if (event.costDeltaUsd !== undefined) {
      history.recentCosts.push(event.costDeltaUsd);
      if (history.recentCosts.length > 5) history.recentCosts.shift();
    }
    if (event.cumulativeCostUsd !== undefined) {
      history.cumulativeCost = event.cumulativeCostUsd;
    }

    // 1. Burn rate spike
    const burnRateAnomaly = this.checkBurnRateSpike(event, session);
    if (burnRateAnomaly) anomalies.push(burnRateAnomaly);

    // Update baseline AFTER check (so current event is compared to prior baseline)
    this.updateBaseline(session.sessionType, event.burnRatePerMin);

    // 2. Generation loop
    const loopAnomaly = this.checkGenerationLoop(event, history);
    if (loopAnomaly) anomalies.push(loopAnomaly);

    // 3. Cost velocity
    const velocityAnomaly = this.checkCostVelocity(event, history);
    if (velocityAnomaly) anomalies.push(velocityAnomaly);

    // 4. Cache efficiency drop
    const cacheAnomaly = this.checkCacheEfficiency(event, session);
    if (cacheAnomaly) anomalies.push(cacheAnomaly);

    return anomalies;
  }

  private checkBurnRateSpike(
    event: { sessionId: string; burnRatePerMin: number },
    session: { id: string; sessionType: string },
  ): Anomaly | null {
    const stats = this.baselineStats.get(session.sessionType);
    if (!stats || stats.burnRate.count < 5) return null; // need baseline

    const ratio = event.burnRatePerMin / stats.burnRate.mean;

    if (ratio >= 5) {
      return {
        type: 'burn_rate_spike',
        severity: 'CRITICAL',
        title: 'Severe burn rate spike',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min is ${ratio.toFixed(1)}x above baseline`,
        sessionId: session.id,
        metadata: { burnRate: event.burnRatePerMin, baseline: stats.burnRate.mean, ratio },
      };
    }

    if (ratio >= 3) {
      return {
        type: 'burn_rate_spike',
        severity: 'WARNING',
        title: 'Burn rate spike detected',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min is ${ratio.toFixed(1)}x above baseline`,
        sessionId: session.id,
        metadata: { burnRate: event.burnRatePerMin, baseline: stats.burnRate.mean, ratio },
      };
    }

    return null;
  }

  private checkGenerationLoop(
    event: { sessionId: string },
    history: SessionEventHistory,
  ): Anomaly | null {
    if (history.outputRatios.length < 3) return null;

    const recent = history.outputRatios.slice(-3);
    const allHigh = recent.every((r) => r > 0.95);

    if (!allHigh) return null;

    return {
      type: 'generation_loop',
      severity: 'WARNING',
      title: 'Possible generation loop',
      message: 'Output token ratio exceeded 95% for 3+ consecutive events',
      sessionId: event.sessionId,
      metadata: { recentRatios: recent },
    };
  }

  private checkCostVelocity(
    event: { sessionId: string },
    history: SessionEventHistory,
  ): Anomaly | null {
    if (history.recentCosts.length < 1) return null;

    const avgDelta = history.recentCosts.reduce((a, b) => a + b, 0) / history.recentCosts.length;
    // Extrapolate: if current cumulative + 10 more events at this avg delta > $100
    const projected = history.cumulativeCost + avgDelta * 10;

    if (projected <= 100) return null;

    return {
      type: 'cost_velocity',
      severity: 'WARNING',
      title: 'High cost velocity',
      message: `Session cost projected to exceed $100 (current: $${history.cumulativeCost.toFixed(2)}, avg delta: $${avgDelta.toFixed(2)})`,
      sessionId: event.sessionId,
      metadata: { cumulativeCost: history.cumulativeCost, avgDelta, projected },
    };
  }

  private checkCacheEfficiency(
    event: { sessionId: string; inputTokens: number; cacheReadTokens: number },
    session: { id: string; sessionType: string },
  ): Anomaly | null {
    const total = event.cacheReadTokens + event.inputTokens;
    if (total === 0) return null;

    const cacheRatio = event.cacheReadTokens / total;
    if (cacheRatio >= 0.3) return null; // above 30% is fine

    // Only alert if we have significant tokens (not a tiny event)
    if (total < 1000) return null;

    return {
      type: 'cache_efficiency_drop',
      severity: 'INFO',
      title: 'Low cache efficiency',
      message: `Cache hit ratio ${(cacheRatio * 100).toFixed(0)}% is below 30% threshold`,
      sessionId: session.id,
      metadata: { cacheRatio, inputTokens: event.inputTokens, cacheReadTokens: event.cacheReadTokens },
    };
  }

  private updateBaseline(sessionType: string, burnRate: number): void {
    let stats = this.baselineStats.get(sessionType);
    if (!stats) {
      stats = { burnRate: { mean: burnRate, count: 1 } };
      this.baselineStats.set(sessionType, stats);
      return;
    }

    // EWMA update
    stats.burnRate.mean = EWMA_ALPHA * burnRate + (1 - EWMA_ALPHA) * stats.burnRate.mean;
    stats.burnRate.count++;
  }

  private getSessionHistory(sessionId: string): SessionEventHistory {
    let history = this.sessionHistory.get(sessionId);
    if (!history) {
      history = { outputRatios: [], recentCosts: [], cumulativeCost: 0 };
      this.sessionHistory.set(sessionId, history);
    }
    return history;
  }

  /** Persist baselines to Redis for restart recovery */
  async persistBaselines(): Promise<void> {
    if (!redis) return;
    const data = Object.fromEntries(this.baselineStats);
    await redis.set('pulse:anomaly_baselines', JSON.stringify(data)).catch(() => {});
  }

  /** Load baselines from Redis on startup */
  async loadBaselines(): Promise<void> {
    if (!redis) return;
    const raw = await redis.get('pulse:anomaly_baselines').catch(() => null);
    if (raw) {
      const data = JSON.parse(raw) as Record<string, RunningStats>;
      this.baselineStats = new Map(Object.entries(data));
    }
  }

  /** Clear session history when session ends */
  clearSession(sessionId: string): void {
    this.sessionHistory.delete(sessionId);
  }

  /** Check for abnormal termination cluster. Called on session_end. */
  checkAbnormalTerminations(sessionId: string, endReason?: string): Anomaly | null {
    // Only track non-normal endings
    const normalReasons = ['completed', 'user_stopped'];
    if (endReason && normalReasons.includes(endReason)) return null;
    // If no endReason provided, treat as abnormal (unexpected disconnect)

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Add this termination
    this.abnormalTerminations.push({ timestamp: now, sessionId });

    // Prune entries older than 1 hour
    this.abnormalTerminations = this.abnormalTerminations.filter((t) => t.timestamp > oneHourAgo);

    // Check threshold: 3+ abnormal terminations in 1 hour
    if (this.abnormalTerminations.length >= 3) {
      const sessionIds = this.abnormalTerminations.map((t) => t.sessionId);
      // Reset to avoid repeated firing
      this.abnormalTerminations = [];

      return {
        type: 'abnormal_termination_cluster',
        severity: 'CRITICAL',
        title: 'Abnormal termination cluster detected',
        message: `${sessionIds.length} sessions ended abnormally within 1 hour`,
        sessionId,
        metadata: { sessionIds, count: sessionIds.length },
      };
    }

    return null;
  }

  /** Test helper */
  _resetForTest(): void {
    this.baselineStats.clear();
    this.sessionHistory.clear();
    this.abnormalTerminations = [];
  }
}

export const anomalyDetector = new AnomalyDetector();
