'use client';

import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon, Notification03Icon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';

/**
 * The hub's one real call-to-action: an agent is waiting on a human
 * confirmation right now. Sources the same queue the top bar's bell and
 * /agents already poll (lib/usePendingRequests) — surfaced here too because
 * a confirmation window is short-lived and shouldn't depend on noticing a
 * badge. Renders nothing when the queue is empty, no empty-state clutter.
 */
export function PendingRequestBanner() {
  const pendingRequests = usePendingRequests();
  if (pendingRequests.length === 0) {
    return null;
  }

  const first = pendingRequests[0];
  const narrative = getActionNarrative(first.secretIdentifier);
  const extraCount = pendingRequests.length - 1;

  return (
    <Card className="animate-veyra-fade-in flex flex-col gap-4 border-(--purple-500)/30 bg-(--purple-500)/5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--purple-500) text-white">
          <HugeiconsIcon icon={Notification03Icon} size={20} strokeWidth={1.5} />
        </span>
        <div>
          <p className="font-semibold text-(--dark-400)">
            {getAgentLabel(first.agentAddress)} wants {narrative.headline}
          </p>
          <p className="mt-0.5 text-sm text-(--dark-300)">
            Waiting on your confirmation{extraCount > 0 ? ` · ${extraCount} more pending` : ''}
          </p>
        </div>
      </div>

      <Link
        href="/agents"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
      >
        Review request
        <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.5} />
      </Link>
    </Card>
  );
}
