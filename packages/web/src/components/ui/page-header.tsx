import { StatusDot } from './status-dot';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  connected?: boolean;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  connected,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)]">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">{title}</h1>
        {subtitle && (
          <p className="text-[13px] text-[var(--text-2)] mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {connected !== undefined && (
          <div className="flex items-center gap-2 rounded-full border border-[var(--green-border)] bg-[var(--green-bg)] px-3 py-1">
            <StatusDot variant="green" pulse={connected} />
            <span className="text-xs font-semibold text-[var(--green)]">
              {connected ? 'Agent Connected' : 'Disconnected'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
