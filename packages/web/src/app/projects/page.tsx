'use client';

import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectCard } from '@/components/projects/project-card';
import { ProjectForm } from '@/components/projects/project-form';
import { useProjects, createProject } from '@/hooks/use-projects';
import { useWebSocket } from '@/hooks/use-websocket';

export default function ProjectsPage() {
  const { connected } = useWebSocket(() => {});
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, mutate, isLoading } = useProjects({ status, q });
  const projects = data?.projects ?? [];

  async function handleCreate(values: {
    slug: string;
    name: string;
    description: string;
    color: string;
    monthlyBudgetUsd: string;
  }) {
    const budget = values.monthlyBudgetUsd
      ? Number(values.monthlyBudgetUsd)
      : null;
    await createProject({
      slug: values.slug,
      name: values.name,
      description: values.description || null,
      color: values.color || null,
      monthlyBudgetUsd: Number.isFinite(budget) && budget && budget > 0 ? budget : null,
    });
    setShowCreate(false);
    mutate();
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${data?.total ?? 0} total projects`}
        connected={connected}
      >
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
        >
          <Plus size={14} /> New Project
        </button>
      </PageHeader>

      <div className="px-8 py-6 max-w-6xl space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1">
            {(['active', 'archived', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-[7px] px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  status === s
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-2)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search projects…"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 py-2 text-[13px]"
            />
          </div>
        </div>

        {showCreate && (
          <ProjectForm
            submitLabel="Create project"
            onCancel={() => setShowCreate(false)}
            onSubmit={handleCreate}
          />
        )}

        {/* Grid */}
        {isLoading && (
          <p className="text-[13px] text-[var(--text-2)] text-center py-12">
            Loading projects…
          </p>
        )}
        {!isLoading && projects.length === 0 && !showCreate && (
          <div className="text-center py-16 text-[var(--text-3)]">
            <p className="text-[15px] font-medium">No projects yet</p>
            <p className="text-[13px] mt-1">
              Projects are auto-created when agents start sessions. You can also
              create one manually to set a budget or archive legacy slugs.
            </p>
          </div>
        )}
        {projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
