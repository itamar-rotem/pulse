// Intelligence Engine types — shared between API and Web

// ── Enums ──────────────────────────────────────────

export type RuleType =
  | 'COST_CAP_SESSION'
  | 'COST_CAP_DAILY'
  | 'COST_CAP_PROJECT'
  | 'MODEL_RESTRICTION'
  | 'BURN_RATE_LIMIT'
  | 'SESSION_DURATION';

export type RuleAction = 'ALERT' | 'PAUSE' | 'BLOCK';

export type AlertType = 'RULE_BREACH' | 'ANOMALY' | 'INSIGHT' | 'SYSTEM';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertStatus = 'ACTIVE' | 'READ' | 'DISMISSED' | 'RESOLVED';

export type InsightCategory =
  | 'COST_OPTIMIZATION'
  | 'USAGE_PATTERN'
  | 'ANOMALY_TREND'
  | 'PLAN_RECOMMENDATION';

export type InsightStatus = 'ACTIVE' | 'DISMISSED' | 'APPLIED';

export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

// ── Interfaces ─────────────────────────────────────

export interface RuleScope {
  projectName?: string;
  sessionType?: string;
  global?: boolean;
}

export interface RuleCondition {
  maxCost?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  allowedModels?: string[];
  maxRate?: number;
  maxMinutes?: number;
}

export interface InsightImpact {
  estimatedSavings?: number;
  confidence?: number;
  percentChange?: number;
}

export interface Rule {
  id: string;
  name: string;
  type: RuleType;
  scope: RuleScope;
  condition: RuleCondition;
  action: RuleAction;
  enabled: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  status: AlertStatus;
  sessionId: string | null;
  ruleId: string | null;
  insightId: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface Insight {
  id: string;
  category: InsightCategory;
  title: string;
  description: string;
  impact: InsightImpact;
  metadata: Record<string, unknown>;
  status: InsightStatus;
  createdAt: string;
  dismissedAt: string | null;
  appliedAt: string | null;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: AlertType[];
  enabled: boolean;
  failCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  lastSentAt: string | null;
}

// ── WebSocket Messages ─────────────────────────────

export interface SessionPauseMessage {
  type: 'session_pause';
  sessionId: string;
  reason: string;
  ruleId?: string;
}

export interface SessionResumeMessage {
  type: 'session_resume';
  sessionId: string;
}

export interface AlertNotification {
  type: 'alert';
  alert: Alert;
}

// ── Service Input Types ────────────────────────────

export interface CreateAlertInput {
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  ruleId?: string;
  insightId?: string;
}

export interface AlertFilters {
  status?: AlertStatus;
  severity?: Severity;
  type?: AlertType;
  since?: string;
  page?: number;
  limit?: number;
}

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  action: RuleAction;
  severity: Severity;
  message: string;
  sessionId: string;
}

export interface Anomaly {
  type: string;
  severity: Severity;
  title: string;
  message: string;
  sessionId: string;
  metadata: Record<string, unknown>;
}
