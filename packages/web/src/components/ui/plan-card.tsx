interface PlanCardProps {
  planName: string;
  monthlyCost: number;
  totalValue: number;
}

export function PlanCard({ planName, monthlyCost, totalValue }: PlanCardProps) {
  const ratio = monthlyCost > 0 ? Math.round(totalValue / monthlyCost) : 0;

  return (
    <div className="rounded-[14px] bg-gradient-to-br from-[#1a1a1a] to-[#2d2520] p-4 text-white">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 mb-2">
        Your Plan
      </p>
      <p className="text-sm font-bold">{planName}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-lg font-extrabold font-mono">${monthlyCost}</span>
        <span className="text-[10px] text-white/50">/mo</span>
      </div>
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">Value ratio</span>
          <span className="text-sm font-bold font-mono text-[var(--green)]">
            {ratio}x
          </span>
        </div>
      </div>
    </div>
  );
}
