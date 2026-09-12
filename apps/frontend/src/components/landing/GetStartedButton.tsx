'use client';

import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { useSetupStatus } from '@/hooks/useSetupStatus';

const sizeClasses = {
  sm: 'px-5 py-2.5 text-sm',
  lg: 'min-w-56 gap-2 px-6 py-4 text-sm',
};

/**
 * Landing always renders (no more redirecting a set-up wallet away from it)
 * — this just swaps the destination and label once we know the wallet's
 * already done with Setup. Defaults to "Get started" while useSetupStatus
 * is still resolving, since that's the correct label for a fresh visitor
 * and only briefly wrong (never navigates anywhere on its own) for a
 * returning one.
 */
export function GetStartedButton({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const { isReady, isSetUp } = useSetupStatus();
  const goToDashboard = isReady && isSetUp;

  return (
    <Link
      href={goToDashboard ? '/dashboard' : '/setup'}
      className={`inline-flex items-center justify-center rounded-full bg-(--purple-500) font-semibold text-white transition hover:bg-[#6b4fe6] ${sizeClasses[size]}`}
    >
      {goToDashboard ? 'Go to dashboard' : 'Get started'}
      {size === 'lg' && <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />}
    </Link>
  );
}
