'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { getActionNarrative } from '@/lib/demoNarrative';
import type { AccessRequest } from './AccessRequestModal';

const reasonCopy: Record<'user_denied' | 'expired', { heading: string; body: string }> = {
  expired: {
    heading: 'No response in time',
    body: 'This confirmation expired before it was answered. The action was denied.',
  },
  user_denied: {
    heading: 'Action denied',
    body: 'You denied this request.',
  },
};

export function DeniedExpired({
  request,
  reason,
  onContinue,
}: {
  request: AccessRequest;
  reason: 'user_denied' | 'expired';
  onContinue: () => void;
}) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const copy = reasonCopy[reason];

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        {copy.heading}
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">{copy.body}</p>

      <div className="mt-10 w-full rounded-2xl border border-(--dark-50) bg-white p-6">
        <p className="font-mono text-sm text-(--dark-400)">{narrative.technical}</p>
        <p className="mt-2 font-mono text-sm text-(--dark-400)">{narrative.headline}</p>
      </div>

      <p className="mt-6 text-sm text-(--dark-300)">No key was ever exposed.</p>

      <button
        type="button"
        onClick={onContinue}
        className="mt-10 inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
      >
        Continue
        <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
