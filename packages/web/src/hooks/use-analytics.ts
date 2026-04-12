'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';

export interface CostTrendPoint {
  date: string;
  cost: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
}

export interface BreakdownItem {
  key: string;
  cost: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  percentage: number;
}

export interface BudgetStatusItem {
  projectId: string;
  projectName: string;
  projectSlug: string;
  monthlyBudgetUsd: number | null;
  actualCostUsd: number;
  sessionsThisMonth: number;
  percentUsed: number | null;
}

interface CostTrendsResponse {
  trends: CostTrendPoint[];
  granularity: string;
  days: number;
}

interface BreakdownResponse {
  breakdown: BreakdownItem[];
  groupBy: string;
  days: number;
}

interface BudgetStatusResponse {
  items: BudgetStatusItem[];
}

export function useCostTrends(params: {
  granularity?: 'day' | 'week' | 'month';
  days?: number;
  projectId?: string;
} = {}) {
  const qs = new URLSearchParams();
  if (params.granularity) qs.set('granularity', params.granularity);
  if (params.days) qs.set('days', String(params.days));
  if (params.projectId) qs.set('projectId', params.projectId);

  return useSWR<CostTrendsResponse>(
    `/api/analytics/cost-trends?${qs}`,
    fetchApi,
    { refreshInterval: 60000 },
  );
}

export function useBreakdown(params: {
  groupBy?: 'project' | 'model' | 'sessionType';
  days?: number;
  projectId?: string;
} = {}) {
  const qs = new URLSearchParams();
  if (params.groupBy) qs.set('groupBy', params.groupBy);
  if (params.days) qs.set('days', String(params.days));
  if (params.projectId) qs.set('projectId', params.projectId);

  return useSWR<BreakdownResponse>(
    `/api/analytics/breakdown?${qs}`,
    fetchApi,
    { refreshInterval: 60000 },
  );
}

export function useBudgetStatus() {
  return useSWR<BudgetStatusResponse>(
    '/api/analytics/budget-status',
    fetchApi,
    { refreshInterval: 60000 },
  );
}

export function getExportUrl(params: { days?: number; projectId?: string } = {}): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const qs = new URLSearchParams();
  if (params.days) qs.set('days', String(params.days));
  if (params.projectId) qs.set('projectId', params.projectId);
  return `${base}/api/analytics/export?${qs}`;
}
