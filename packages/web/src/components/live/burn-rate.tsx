interface BurnRateProps {
  current: number;
  average: number;
}

export function BurnRate({ current, average }: BurnRateProps) {
  const ratio = average > 0 ? current / average : 0;
  const color = ratio > 2 ? 'text-red-500' : ratio > 1.5 ? 'text-amber-500' : 'text-green-500';

  return (
    <div className="text-center">
      <p className="text-xs text-neutral-500 mb-1">Burn Rate</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>
        {current.toFixed(0)}
      </p>
      <p className="text-xs text-neutral-500">tok/min</p>
      {average > 0 && (
        <p className="text-xs text-neutral-500 mt-1">
          avg: {average.toFixed(0)} tok/min
        </p>
      )}
    </div>
  );
}
