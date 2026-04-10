'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { setTokenProvider } from '@/lib/api';

export function TokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);

  return <>{children}</>;
}
