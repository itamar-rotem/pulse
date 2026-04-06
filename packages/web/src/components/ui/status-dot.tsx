import { cn } from '@/lib/utils';

type StatusDotVariant = 'green' | 'amber' | 'red';

interface StatusDotProps {
  variant?: StatusDotVariant;
  pulse?: boolean;
  className?: string;
}

const variantColors: Record<StatusDotVariant, string> = {
  green: 'bg-[var(--green)] text-[var(--green)]',
  amber: 'bg-[var(--amber)] text-[var(--amber)]',
  red: 'bg-[var(--red)] text-[var(--red)]',
};

export function StatusDot({
  variant = 'green',
  pulse = false,
  className,
}: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full shrink-0',
        variantColors[variant],
        pulse && 'animate-[pulse-dot_2s_infinite]',
        className,
      )}
    />
  );
}
