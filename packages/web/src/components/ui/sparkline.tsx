interface SparklineProps {
  data: number[];
  color?: string;
  spikeColor?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = 'var(--blue)',
  spikeColor = 'var(--red)',
  height = 16,
  className,
}: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const threshold = max * 0.85;
  const barWidth = 3;
  const gap = 1;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {data.map((value, i) => {
        const barHeight = max > 0 ? (value / max) * height : 0;
        const isSpike = value >= threshold && max > 0;
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={isSpike ? spikeColor : color}
          />
        );
      })}
    </svg>
  );
}
