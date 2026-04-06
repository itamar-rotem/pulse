import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface InsightCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function InsightCard({
  icon: Icon,
  title,
  description,
  onDismiss,
  actionLabel,
  onAction,
  className,
}: InsightCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-5 pl-7 shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
        className,
      )}
    >
      {/* Accent left border */}
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-dark)]" />

      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 rounded-lg bg-[var(--accent-bg)] p-2">
          <Icon size={16} className="text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-1)]">{title}</p>
          <p className="text-[13px] text-[var(--text-2)] mt-1">{description}</p>
          <div className="flex items-center gap-2 mt-3">
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="rounded-[9px] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)] transition-opacity hover:opacity-90"
              >
                {actionLabel}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="rounded-[9px] border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
