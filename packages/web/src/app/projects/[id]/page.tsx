'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatTag } from '@/components/ui/stat-tag';
import { BudgetGauge } from '@/components/projects/budget-gauge';
import { useProject } from '@/hooks/use-projects';
import { useWebSocket } from '@/hooks/use-websocket';
import { formatCost } from '@/lib/format';

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { connected } = useWebSocket(() => {});
  const { data: project, isLoading } = useProject(id);

  return (
    <div>
      <PageHeader
        title={project?.name ?? 'Project'}
        subtitle={project ? project.slug : undefined}
        connected={connected}
      >
        <Link
          href="/projects"
          className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        {project && (
          <Link
            href={`/projects/${project.id}/settings`}
            className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <SettingsIcon size={14} />
            Settings
          </Link>
        )}
      </PageHeader>

      <div className="p-8 max-w-5xl space-y-6">
        {isLoading && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Loading…
          </p>
        )}

        {!isLoading && !project && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Project not found.
          </p>
        )}

        {project && (
          <>
            <div className="flex items-start gap-6">
              <div className="flex-1 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-6">
                <div className="flex items-center gap-2 mb-3">
                  <StatTag
                    variant={project.status === 'ACTIVE' ? 'green' : 'neutral'}
                  >
                    {project.status}
                  </StatTag>
                  {project.color && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--text-3)]"
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ background: project.color }}
                      />
                      {project.color}
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[var(--text-2)]">
                  {project.description || 'No description provided.'}
                </p>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  <StatCard
                    label="Sessions (30d)"
                    value={String(project.stats.sessions30d)}
                  />
                  <StatCard
                    label="Cost (30d)"
                    value={formatCost(project.stats.cost30d)}
                  />
                  <StatCard
                    label="Active now"
                    value={String(project.stats.activeSessions)}
                  />
                </div>
              </div>
              <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col items-center justify-center min-w-[200px]">
                <p className="text-[11px] font-medium text-[var(--text-2)] mb-3">
                  Monthly budget
                </p>
                <BudgetGauge
                  spent={project.stats.cost30d}
                  budget={project.monthlyBudgetUsd}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/sessions?projectId=${project.id}`}
                className="rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                View sessions
              </Link>
              <Link
                href={`/alerts?projectId=${project.id}`}
                className="rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                View alerts
              </Link>
              <Link
                href={`/insights?projectId=${project.id}`}
                className="rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                View insights
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
