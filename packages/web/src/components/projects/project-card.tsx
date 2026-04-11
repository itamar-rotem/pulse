import Link from 'next/link';
import { Folder, Archive } from 'lucide-react';
import { StatTag } from '@/components/ui/stat-tag';
import { formatCost } from '@/lib/format';
import type { Project } from '@/hooks/use-projects';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const isArchived = project.status === 'ARCHIVED';
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-hover)]"
    >
      <div className="flex items-start gap-3">
        <div
          className="size-10 rounded-[10px] flex items-center justify-center shrink-0"
          style={{
            background: project.color
              ? `${project.color}22`
              : 'var(--surface-hover)',
          }}
        >
          <Folder
            size={18}
            style={{ color: project.color ?? 'var(--text-2)' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--text-1)] truncate">
              {project.name}
            </span>
            {isArchived && (
              <StatTag variant="neutral">
                <Archive size={10} className="mr-0.5" /> Archived
              </StatTag>
            )}
          </div>
          <p className="text-[11px] font-mono text-[var(--text-3)] mt-0.5">
            {project.slug}
          </p>
          {project.description && (
            <p className="text-[12px] text-[var(--text-2)] mt-2 line-clamp-2">
              {project.description}
            </p>
          )}
          {project.monthlyBudgetUsd != null && (
            <div className="mt-3 text-[11px] text-[var(--text-3)]">
              Monthly budget:{' '}
              <span className="font-semibold text-[var(--text-2)]">
                {formatCost(project.monthlyBudgetUsd)}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
