'use client';

import { AlertTriangle, Bell, Info, X } from 'lucide-react';
import Link from 'next/link';
import { useToast, type Toast } from './toast-context';

const SEVERITY_STYLES: Record<
  Toast['severity'],
  { border: string; icon: string; bg: string }
> = {
  CRITICAL: {
    border: 'var(--red-border)',
    icon: 'var(--red)',
    bg: 'var(--red-bg)',
  },
  WARNING: {
    border: 'var(--amber-border)',
    icon: 'var(--amber)',
    bg: 'var(--amber-bg)',
  },
  INFO: {
    border: 'var(--border)',
    icon: 'var(--blue)',
    bg: 'var(--surface)',
  },
};

const SEVERITY_ICON = {
  CRITICAL: AlertTriangle,
  WARNING: Bell,
  INFO: Info,
} as const;

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[380px] pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const style = SEVERITY_STYLES[toast.severity];
  const Icon = SEVERITY_ICON[toast.severity];

  const content = (
    <div
      className="pointer-events-auto rounded-[14px] border shadow-lg shadow-black/5 p-3.5 flex gap-3 items-start"
      style={{
        borderColor: style.border,
        background: style.bg,
        animation: 'toast-slide-in 0.25s ease-out',
      }}
    >
      <div
        className="mt-0.5 shrink-0 size-7 rounded-[8px] flex items-center justify-center"
        style={{ background: style.icon, opacity: 0.12 }}
      >
        <Icon size={14} style={{ color: style.icon }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: style.icon }}
          >
            {toast.severity}
          </span>
        </div>
        <p className="text-[13px] font-semibold text-[var(--text-1)] leading-snug truncate">
          {toast.title}
        </p>
        <p className="text-[12px] text-[var(--text-2)] mt-0.5 line-clamp-2">
          {toast.message}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="shrink-0 p-1 rounded-md hover:bg-black/5 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );

  if (toast.href) {
    return (
      <Link href={toast.href} className="block" onClick={onDismiss}>
        {content}
      </Link>
    );
  }

  return content;
}
