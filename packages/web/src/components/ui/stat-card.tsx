import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  children?: React.ReactNode;
  inverted?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  children,
  inverted = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-[20px] border p-5 transition-colors',
        inverted
          ? 'bg-gradient-to-br from-[#1a1a1a] to-[#2d2520] border-[#1a1a1a] text-white'
          : 'bg-[var(--surface)] border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
        className,
      )}
    >
      <p
        className={cn(
          'text-[11px] font-medium mb-1',
          inverted ? 'text-white/60' : 'text-[var(--text-2)]',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'text-[28px] font-extrabold font-mono leading-tight',
          inverted ? 'text-white' : 'text-[var(--text-1)]',
        )}
      >
        {value}
      </p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
