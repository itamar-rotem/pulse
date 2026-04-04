interface CostMeterProps {
  cost: number;
}

export function CostMeter({ cost }: CostMeterProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-neutral-500 mb-1">Session Cost</p>
      <p className="text-3xl font-bold font-mono">
        ${cost.toFixed(4)}
      </p>
    </div>
  );
}
