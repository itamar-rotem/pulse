'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Archive, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectForm } from '@/components/projects/project-form';
import {
  useProject,
  updateProject,
  archiveProject,
  restoreProject,
} from '@/hooks/use-projects';
import { useWebSocket } from '@/hooks/use-websocket';

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { connected } = useWebSocket(() => {});
  const { data: project, mutate, isLoading } = useProject(id);

  async function handleUpdate(values: {
    slug: string;
    name: string;
    description: string;
    color: string;
    monthlyBudgetUsd: string;
  }) {
    const budget = values.monthlyBudgetUsd
      ? Number(values.monthlyBudgetUsd)
      : null;
    await updateProject(id, {
      name: values.name,
      description: values.description || null,
      color: values.color || null,
      monthlyBudgetUsd:
        Number.isFinite(budget) && budget && budget > 0 ? budget : null,
    });
    mutate();
  }

  async function handleArchive() {
    if (!confirm('Archive this project? Budget rule will be disabled.')) return;
    await archiveProject(id);
    mutate();
  }

  async function handleRestore() {
    await restoreProject(id);
    mutate();
  }

  return (
    <div>
      <PageHeader
        title={project ? `${project.name} — Settings` : 'Project Settings'}
        connected={connected}
      >
        <Link
          href={project ? `/projects/${project.id}` : '/projects'}
          className="flex items-center gap-1.5 rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
      </PageHeader>

      <div className="p-8 max-w-3xl space-y-6">
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
            <ProjectForm
              initial={project}
              disableSlug
              submitLabel="Save changes"
              onSubmit={handleUpdate}
            />

            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">
                Danger zone
              </h3>
              <p className="text-[12px] text-[var(--text-3)] mt-1">
                Archiving a project hides it from dashboards and disables its
                budget rule. Historical sessions remain linked for auditing.
              </p>
              <div className="mt-3 flex items-center gap-2">
                {project.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={handleArchive}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--red)] bg-[var(--red-bg)] px-4 py-2 text-[13px] font-semibold text-[var(--red)]"
                  >
                    <Archive size={14} /> Archive project
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRestore}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-1)]"
                  >
                    <RotateCcw size={14} /> Restore project
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push('/projects')}
                  className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)]"
                >
                  Back to projects
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
