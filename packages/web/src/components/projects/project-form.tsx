'use client';

import { useState } from 'react';
import type { Project } from '@/hooks/use-projects';

export interface ProjectFormValues {
  slug: string;
  name: string;
  description: string;
  color: string;
  monthlyBudgetUsd: string;
}

interface ProjectFormProps {
  initial?: Partial<Project>;
  disableSlug?: boolean;
  submitLabel?: string;
  onSubmit: (values: ProjectFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

const COLOR_OPTIONS = [
  '#ff6b35',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];

export function ProjectForm({
  initial,
  disableSlug,
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? COLOR_OPTIONS[0]);
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState(
    initial?.monthlyBudgetUsd != null ? String(initial.monthlyBudgetUsd) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugValid = /^[a-z0-9][a-z0-9-_]{0,63}$/.test(slug);
  const canSubmit =
    name.trim().length > 0 && (disableSlug || slugValid) && !submitting;

  async function handle() {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        slug,
        name: name.trim(),
        description: description.trim(),
        color: color ?? '',
        monthlyBudgetUsd,
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">
            Name
          </label>
          <input
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. API Gateway"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">
            Slug
          </label>
          <input
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] font-mono disabled:opacity-60"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="api-gateway"
            disabled={disableSlug}
          />
          {!disableSlug && slug && !slugValid && (
            <p className="text-[11px] text-[var(--red)] mt-1">
              Lowercase letters, digits, dashes, underscores only.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">
          Description
        </label>
        <textarea
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">
            Color
          </label>
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-[var(--text-1)]' : 'border-transparent'}`}
                style={{ background: c }}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">
            Monthly budget ($)
          </label>
          <input
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px] font-mono"
            type="number"
            min="0"
            step="1"
            value={monthlyBudgetUsd}
            onChange={(e) => setMonthlyBudgetUsd(e.target.value)}
            placeholder="0 for no limit"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-[8px] border border-[var(--red)] bg-[var(--red-bg)] px-3 py-2 text-[12px] text-[var(--red)]">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-2)]"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handle}
          disabled={!canSubmit}
          className="rounded-[8px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
