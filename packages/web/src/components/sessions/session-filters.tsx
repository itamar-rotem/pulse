'use client';

interface SessionFiltersProps {
  sessionType: string;
  onSessionTypeChange: (value: string) => void;
  project: string;
  onProjectChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
  projects: string[];
  models: string[];
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-[var(--text-3)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] outline-none focus:border-[var(--accent)] transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SessionFilters({
  sessionType,
  onSessionTypeChange,
  project,
  onProjectChange,
  model,
  onModelChange,
  timeRange,
  onTimeRangeChange,
  projects,
  models,
}: SessionFiltersProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <FilterPill
        label="Type"
        value={sessionType}
        onChange={onSessionTypeChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'human', label: 'Human' },
          { value: 'agent', label: 'Agent' },
        ]}
      />
      <FilterPill
        label="Project"
        value={project}
        onChange={onProjectChange}
        options={[
          { value: 'all', label: 'All Projects' },
          ...projects.map((p) => ({ value: p, label: p })),
        ]}
      />
      <FilterPill
        label="Model"
        value={model}
        onChange={onModelChange}
        options={[
          { value: 'all', label: 'All Models' },
          ...models.map((m) => ({ value: m, label: m })),
        ]}
      />
      <FilterPill
        label="Period"
        value={timeRange}
        onChange={onTimeRangeChange}
        options={[
          { value: '24h', label: '24h' },
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
        ]}
      />
    </div>
  );
}
