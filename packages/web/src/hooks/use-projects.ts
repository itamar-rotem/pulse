'use client';

import useSWR from 'swr';
import { fetchApi } from '@/lib/api';

export interface Project {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  monthlyBudgetUsd: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProjectWithStats extends Project {
  stats: {
    sessions30d: number;
    cost30d: number;
    activeSessions: number;
  };
}

interface ProjectsResponse {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
}

const fetcher = <T,>(path: string) => fetchApi<T>(path);

export function useProjects(params: { status?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return useSWR<ProjectsResponse>(`/api/projects${query}`, fetcher<ProjectsResponse>, {
    refreshInterval: 30000,
  });
}

export function useProject(id: string | undefined) {
  return useSWR<ProjectWithStats>(
    id ? `/api/projects/${id}` : null,
    fetcher<ProjectWithStats>,
    { refreshInterval: 30000 },
  );
}

// ── Mutation helpers ───────────────────────────────

export async function createProject(body: Partial<Project>): Promise<Project> {
  return fetchApi<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateProject(id: string, body: Partial<Project>): Promise<Project> {
  return fetchApi<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function archiveProject(id: string): Promise<Project> {
  return fetchApi<Project>(`/api/projects/${id}`, { method: 'DELETE' });
}

export async function restoreProject(id: string): Promise<Project> {
  return fetchApi<Project>(`/api/projects/${id}/restore`, { method: 'POST' });
}
