'use client';

interface TokenGaugeProps {
  used: number;
  limit: number;
}

export function TokenGauge({ used, limit }: TokenGaugeProps) {
  const percentage = Math.min((used / limit) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color = percentage > 90 ? '#ef4444' : percentage > 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{percentage.toFixed(0)}%</span>
        <span className="text-xs text-neutral-500">
          {(used / 1000).toFixed(0)}k / {(limit / 1000).toFixed(0)}k
        </span>
      </div>
    </div>
  );
}
