import { redis } from '../redis.js';
import type { RuleViolation, RuleScope, RuleCondition, RuleAction, RuleType } from '@pulse/shared';
import { prisma as globalPrisma } from '../prisma.js';

interface CachedRule {
  id: string;
  orgId: string;
  name: string;
  type: RuleType;
  scope: RuleScope;
  condition: RuleCondition;
  action: RuleAction;
  enabled: boolean;
}

interface SessionContext {
  id: string;
  costUsd: number;
  projectSlug: string;
  sessionType: string;
  startedAt: Date | string;
}

interface EventContext {
  sessionId: string;
  burnRatePerMin: number;
  model: string;
}

class RuleEngine {
  private rulesByOrg: Map<string, CachedRule[]> = new Map();
  private violationTimers = new Map<string, number>(); // ruleId:sessionId → timestamp ms

  /** Refresh rules from database. Called by scheduler every 60s. */
  async refreshCache(): Promise<void> {
    const dbRules = await globalPrisma.rule.findMany({ where: { enabled: true } });
    const byOrg = new Map<string, CachedRule[]>();
    for (const r of dbRules) {
      const cached: CachedRule = {
        id: r.id,
        orgId: r.orgId,
        name: r.name,
        type: r.type as RuleType,
        scope: r.scope as unknown as RuleScope,
        condition: r.condition as unknown as RuleCondition,
        action: r.action as RuleAction,
        enabled: r.enabled,
      };
      const list = byOrg.get(r.orgId) ?? [];
      list.push(cached);
      byOrg.set(r.orgId, list);
    }
    this.rulesByOrg = byOrg;
  }

  /** Evaluate all rules for an org against a token event + session state. */
  async evaluate(
    event: EventContext,
    session: SessionContext,
    orgId: string,
  ): Promise<RuleViolation[]> {
    const violations: RuleViolation[] = [];
    const rules = this.rulesByOrg.get(orgId) ?? [];

    for (const rule of rules) {
      if (!this.matchesScope(rule.scope, session, event)) continue;

      const violation = await this.evaluateRule(rule, event, session);
      if (violation) violations.push(violation);
    }

    return violations;
  }

  private matchesScope(scope: RuleScope, session: SessionContext, _event: EventContext): boolean {
    if (scope.global) return true;
    if (scope.projectName && session.projectSlug !== scope.projectName) return false;
    if (scope.sessionType && session.sessionType !== scope.sessionType) return false;
    // If scope has specific project or session type and they match, return true
    return !!(scope.projectName || scope.sessionType);
  }

  private async evaluateRule(
    rule: CachedRule,
    event: EventContext,
    session: SessionContext,
  ): Promise<RuleViolation | null> {
    switch (rule.type) {
      case 'COST_CAP_SESSION':
        return this.checkCostCapSession(rule, session);

      case 'COST_CAP_DAILY':
        return this.checkCostCapDaily(rule);

      case 'COST_CAP_PROJECT':
        return this.checkCostCapProject(rule, session);

      case 'MODEL_RESTRICTION':
        return this.checkModelRestriction(rule, event);

      case 'BURN_RATE_LIMIT':
        return this.checkBurnRateLimit(rule, event, session);

      case 'SESSION_DURATION':
        return this.checkSessionDuration(rule, session);

      default:
        return null;
    }
  }

  private checkCostCapSession(rule: CachedRule, session: SessionContext): RuleViolation | null {
    const maxCost = rule.condition.maxCost ?? Infinity;
    if (session.costUsd < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Session cost $${session.costUsd.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: session.id,
    };
  }

  private async checkCostCapDaily(rule: CachedRule): Promise<RuleViolation | null> {
    const maxCost = rule.condition.maxCost ?? Infinity;
    const cacheKey = `pulse:daily_cost:${rule.orgId}`;

    // Try Redis cache first, fall back to DB
    let todayCost = 0;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      todayCost = parseFloat(cached);
    } else {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const result = await globalPrisma.session.aggregate({
        where: { orgId: rule.orgId, startedAt: { gte: todayStart } },
        _sum: { costUsd: true },
      });
      todayCost = result._sum.costUsd ?? 0;
      // Write back to Redis for subsequent evaluations
      await redis.set(cacheKey, todayCost.toString(), 'EX', 86400).catch(() => {});
    }

    if (todayCost < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: todayCost >= maxCost * 1.1 ? 'CRITICAL' : 'WARNING',
      message: `Daily spend $${todayCost.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: '',
    };
  }

  private async checkCostCapProject(rule: CachedRule, session: SessionContext): Promise<RuleViolation | null> {
    const maxCost = rule.condition.maxCost ?? Infinity;
    const period = rule.condition.period ?? 'daily';
    const cacheKey = `pulse:project_cost:${rule.orgId}:${session.projectSlug}:${period}`;

    let projectCost = 0;

    // Try Redis cache first
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      projectCost = parseFloat(cached);
    } else {
      // Fall back to DB aggregation
      const periodStart = new Date();
      if (period === 'daily') {
        periodStart.setUTCHours(0, 0, 0, 0);
      } else if (period === 'weekly') {
        periodStart.setUTCDate(periodStart.getUTCDate() - periodStart.getUTCDay());
        periodStart.setUTCHours(0, 0, 0, 0);
      } else {
        periodStart.setUTCDate(1);
        periodStart.setUTCHours(0, 0, 0, 0);
      }

      const result = await globalPrisma.session.aggregate({
        where: {
          orgId: rule.orgId,
          projectSlug: session.projectSlug,
          startedAt: { gte: periodStart },
        },
        _sum: { costUsd: true },
      });
      projectCost = result._sum.costUsd ?? 0;

      // Write back to Redis for subsequent evaluations
      const ttl = period === 'monthly' ? 31 * 86400 : period === 'weekly' ? 7 * 86400 : 86400;
      await redis.set(cacheKey, projectCost.toString(), 'EX', ttl).catch(() => {});
    }

    if (projectCost < maxCost) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Project "${session.projectSlug}" ${period} spend $${projectCost.toFixed(2)} exceeds cap of $${maxCost}`,
      sessionId: session.id,
    };
  }

  private checkModelRestriction(rule: CachedRule, event: EventContext): RuleViolation | null {
    const allowed = rule.condition.allowedModels ?? [];
    if (allowed.length === 0) return null;

    const modelMatch = allowed.some((m) => event.model.includes(m));
    if (modelMatch) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Model "${event.model}" is not allowed. Permitted: ${allowed.join(', ')}`,
      sessionId: event.sessionId,
    };
  }

  private checkBurnRateLimit(rule: CachedRule, event: EventContext, session: SessionContext): RuleViolation | null {
    const maxRate = rule.condition.maxRate ?? Infinity;
    const timerKey = `${rule.id}:${event.sessionId}`;

    if (event.burnRatePerMin < maxRate) {
      this.violationTimers.delete(timerKey);
      return null;
    }

    const now = Date.now();
    const firstViolation = this.violationTimers.get(timerKey);

    if (!firstViolation) {
      this.violationTimers.set(timerKey, now);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.type,
        action: 'ALERT',
        severity: 'WARNING',
        message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min exceeds limit of ${maxRate}`,
        sessionId: session.id,
      };
    }

    const sustained = now - firstViolation >= 2 * 60 * 1000; // 2 minutes
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: sustained ? 'PAUSE' : 'ALERT',
      severity: sustained ? 'CRITICAL' : 'WARNING',
      message: `Burn rate ${Math.round(event.burnRatePerMin)} tok/min exceeds limit of ${maxRate}${sustained ? ' (sustained 2+ min)' : ''}`,
      sessionId: session.id,
    };
  }

  private checkSessionDuration(rule: CachedRule, session: SessionContext): RuleViolation | null {
    const maxMinutes = rule.condition.maxMinutes ?? Infinity;
    const startedAt = typeof session.startedAt === 'string' ? new Date(session.startedAt) : session.startedAt;
    const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60_000;

    if (elapsedMinutes < maxMinutes) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      action: rule.action,
      severity: 'CRITICAL',
      message: `Session duration ${Math.round(elapsedMinutes)} min exceeds limit of ${maxMinutes} min`,
      sessionId: session.id,
    };
  }

  /** Test helper: inject rules for a specific org without DB */
  _setRulesForTest(orgId: string, rules: CachedRule[]): void {
    this.rulesByOrg.set(orgId, rules);
    this.violationTimers.clear();
  }

  /** Test helper: clear all cached rules */
  _clearRulesForTest(): void {
    this.rulesByOrg.clear();
    this.violationTimers.clear();
  }
}

export const ruleEngine = new RuleEngine();
