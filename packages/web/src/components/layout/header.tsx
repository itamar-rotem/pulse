'use client';

import { PageHeader } from '@/components/ui/page-header';

/** @deprecated — use PageHeader directly. This shim exists during the migration. */
export function Header({ connected }: { connected: boolean }) {
  return <PageHeader title="" connected={connected} />;
}
