'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function NavItem({ href, label, icon: Icon, badge }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-[13px] font-medium transition-colors duration-150',
        isActive
          ? 'bg-[var(--accent-bg)] border border-[var(--accent-border)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-2)] hover:bg-[var(--surface-hover)] border border-transparent',
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-[var(--accent)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </Link>
  );
}
