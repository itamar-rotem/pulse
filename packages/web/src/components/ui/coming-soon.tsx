import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  previewCards?: Array<{
    title: string;
    description: string;
  }>;
}

export function ComingSoon({
  icon: Icon,
  title,
  description,
  previewCards,
}: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 max-w-lg mx-auto text-center">
      <div className="rounded-2xl bg-[var(--accent-bg)] p-4 mb-6">
        <Icon size={32} className="text-[var(--accent)]" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--text-1)] mb-2">{title}</h2>
      <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
        {description}
      </p>

      {previewCards && previewCards.length > 0 && (
        <div className="mt-8 w-full space-y-3">
          {previewCards.map((card, i) => (
            <div
              key={i}
              className="relative rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4 pl-6 text-left opacity-60"
            >
              <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-dark)]" />
              <p className="text-sm font-semibold text-[var(--text-1)]">
                {card.title}
              </p>
              <p className="text-[12px] text-[var(--text-2)] mt-1">
                {card.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
