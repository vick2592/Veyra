'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';

/** Wraps the (server-rendered) landing content. An already set-up wallet
 * skips the marketing page entirely and goes straight to /agents. */
export function EntryGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isReady, isSetUp } = useSetupStatus();

  useEffect(() => {
    if (isReady && isSetUp) {
      router.replace('/agents');
    }
  }, [isReady, isSetUp, router]);

  if (!isReady || isSetUp) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}
