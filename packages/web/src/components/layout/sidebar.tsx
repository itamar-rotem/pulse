'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '~' },
  { href: '/live', label: 'Live View', icon: '>' },
  { href: '/sessions', label: 'Sessions', icon: '#' },
  { href: '/settings', label: 'Settings', icon: '*' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-neutral-50 dark:bg-neutral-900 p-4 flex flex-col gap-1">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Pulse</h1>
        <p className="text-xs text-neutral-500">AI Dev Health Monitor</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800',
              pathname === item.href && 'bg-neutral-200 dark:bg-neutral-800 font-medium'
            )}
          >
            <span className="font-mono text-xs w-4">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
