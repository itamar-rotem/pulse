'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';
import type { Rule, Alert, Insight, Webhook, AlertFilters } from '@pulse/shared';

const fetcher = <T,>(path: string) => fetchApi<T>(path);

interface AlertsResponse {
  alerts: Alert[];
  total: number;
  page: number;
  limit: number;
}

interface InsightsResponse {
  insights: Insight[];
  total: number;
  page: number;
  limit: number;
}

export function useAlerts(filters?: Partial<AlertFilters>) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const query = params.toString() ? `?${params}` : '';

  return useSWR<AlertsResponse>(`/api/alerts${query}`, fetcher<AlertsResponse>, {
    refreshInterval: 10000,
  });
}

export function useUnreadAlertCount() {
  return useSWR<{ count: number }>('/api/alerts/unread-count', fetcher<{ count: number }>, {
    refreshInterval: 10000,
  });
}

export function useRules() {
  return useSWR<Rule[]>('/api/rules', fetcher<Rule[]>, {
    refreshInterval: 30000,
  });
}

export function useInsights(filters?: { category?: string; status?: string; page?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  const query = params.toString() ? `?${params}` : '';

  return useSWR<InsightsResponse>(`/api/insights${query}`, fetcher<InsightsResponse>, {
    refreshInterval: 30000,
  });
}

export function useWebhooks() {
  return useSWR<Webhook[]>('/api/webhooks', fetcher<Webhook[]>, {
    refreshInterval: 30000,
  });
}

// ── Mutation helpers ────────────────────────────────

export async function toggleRule(id: string): Promise<Rule> {
  return fetchApi<Rule>(`/api/rules/${id}/toggle`, { method: 'POST' });
}

export async function createRule(data: Partial<Rule>): Promise<Rule> {
  return fetchApi<Rule>('/api/rules', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteRule(id: string): Promise<void> {
  await fetchApi(`/api/rules/${id}`, { method: 'DELETE' });
}

export async function markAlertRead(id: string): Promise<void> {
  await fetchApi(`/api/alerts/${id}/read`, { method: 'PUT' });
}

export async function dismissAlert(id: string): Promise<void> {
  await fetchApi(`/api/alerts/${id}/dismiss`, { method: 'PUT' });
}

export async function batchMarkAlertsRead(ids: string[]): Promise<void> {
  await fetchApi('/api/alerts/batch/read', { method: 'PUT', body: JSON.stringify({ ids }) });
}

export async function batchDismissAlerts(ids: string[]): Promise<void> {
  await fetchApi('/api/alerts/batch/dismiss', { method: 'PUT', body: JSON.stringify({ ids }) });
}

export async function dismissInsight(id: string): Promise<void> {
  await fetchApi(`/api/insights/${id}/dismiss`, { method: 'PUT' });
}

export async function applyInsight(id: string): Promise<{ insight: Insight; ruleId?: string }> {
  return fetchApi(`/api/insights/${id}/apply`, { method: 'PUT' });
}

export async function createWebhook(data: Partial<Webhook>): Promise<Webhook> {
  return fetchApi<Webhook>('/api/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: string): Promise<void> {
  await fetchApi(`/api/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  return fetchApi(`/api/webhooks/${id}/test`, { method: 'POST' });
}
