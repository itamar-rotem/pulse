'use client';

import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  connected: boolean;
}

export function Header({ connected }: HeaderProps) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6">
      <div />
      <Badge variant={connected ? 'default' : 'secondary'}>
        {connected ? 'Live' : 'Disconnected'}
      </Badge>
    </header>
  );
}
