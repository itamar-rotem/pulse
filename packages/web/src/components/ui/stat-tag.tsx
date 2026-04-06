import { cn } from '@/lib/utils';

type StatTagVariant = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'neutral';

interface StatTagProps {
  variant?: StatTagVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<StatTagVariant, string> = {
  blue: 'bg-[var(--blue-bg)] text-[var(--blue)]',
  purple: 'bg-[var(--purple-bg)] text-[var(--purple)]',
  green: 'bg-[var(--green-bg)] text-[var(--green)]',
  amber: 'bg-[var(--amber-bg)] text-[var(--amber)]',
  red: 'bg-[var(--red-bg)] text-[var(--red)]',
  neutral: 'bg-[var(--surface-hover)] text-[var(--text-2)]',
};

export function StatTag({ variant = 'neutral', children, className }: StatTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
