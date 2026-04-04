'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';

const fetcher = <T,>(path: string) => fetchApi<T>(path);

interface LiveSummaryData {
  activeSessions: number;
  totalCostToday: number;
  humanCostToday: number;
  agentCostToday: number;
  humanSessionsToday: number;
  agentSessionsToday: number;
}

interface SessionHistoryData {
  sessions: Array<{
    id: string;
    tool: string;
    projectSlug: string;
    sessionType: string;
    model: string;
    startedAt: string;
    endedAt: string | null;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

interface SessionDetailData {
  id: string;
  tool: string;
  projectSlug: string;
  sessionType: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  tokenEvents: Array<{
    timestamp: string;
    cumulativeCostUsd: number;
    cumulativeInputTokens: number;
    cumulativeOutputTokens: number;
    burnRatePerMin: number;
  }>;
}

export function useLiveSummary() {
  return useSWR<LiveSummaryData>('/api/dashboard/live-summary', fetcher<LiveSummaryData>, {
    refreshInterval: 5000,
  });
}

export function useSessionHistory(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return useSWR<SessionHistoryData>(`/api/sessions/history${query}`, fetcher<SessionHistoryData>, {
    refreshInterval: 10000,
  });
}

export function useSessionDetail(id: string) {
  return useSWR<SessionDetailData>(id ? `/api/sessions/${id}` : null, fetcher<SessionDetailData>);
}
