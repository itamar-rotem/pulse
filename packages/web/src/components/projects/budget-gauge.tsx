import { RingGauge } from '@/components/ui/ring-gauge';
import { formatCost } from '@/lib/format';

interface BudgetGaugeProps {
  spent: number;
  budget: number | null;
  size?: number;
}

export function BudgetGauge({ spent, budget, size = 96 }: BudgetGaugeProps) {
  if (!budget || budget <= 0) {
    return (
      <div className="flex flex-col items-center gap-1">
        <RingGauge value={0} max={1} size={size} color="var(--border)">
          <div className="text-center">
            <p className="text-[11px] text-[var(--text-3)]">No budget</p>
          </div>
        </RingGauge>
      </div>
    );
  }

  const pct = Math.min(spent / budget, 1);
  const color =
    pct >= 1
      ? 'var(--red)'
      : pct >= 0.8
        ? 'var(--amber)'
        : 'var(--green)';

  return (
    <RingGauge value={spent} max={budget} size={size} color={color}>
      <div className="text-center">
        <p className="text-[15px] font-extrabold font-mono text-[var(--text-1)] leading-tight">
          {Math.round(pct * 100)}%
        </p>
        <p className="text-[10px] text-[var(--text-3)] leading-tight">
          {formatCost(spent)} / {formatCost(budget)}
        </p>
      </div>
    </RingGauge>
  );
}
