export type SessionType = 'human' | 'agent_local' | 'agent_remote';
export type ToolName = 'claude_code' | 'cursor' | 'windsurf';

export interface TokenEvent {
  sessionId: string;
  timestamp: string;
  tool: ToolName;
  model: string;
  projectSlug: string;
  sessionType: SessionType;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costDeltaUsd: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCostUsd: number;
  burnRatePerMin: number;
}

export interface Session {
  id: string;
  tool: ToolName;
  projectSlug: string;
  sessionType: SessionType;
  model: string;
  userName?: string | null;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export type { SessionStatus } from './intelligence-types.js';

export interface LiveSummary {
  activeSessions: number;
  totalCostToday: number;
  humanCostToday: number;
  agentCostToday: number;
  humanSessionsToday: number;
  agentSessionsToday: number;
  currentBurnRatePerMin: number;
}

export interface SessionHistoryQuery {
  page?: number;
  limit?: number;
  tool?: ToolName;
  projectSlug?: string;
  sessionType?: SessionType;
  startDate?: string;
  endDate?: string;
}

export interface CostInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
