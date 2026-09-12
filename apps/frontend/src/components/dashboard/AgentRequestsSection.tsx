'use client';

import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';

/**
 * A plain, always-present section rather than a top-of-page alert banner —
 * "what's an agent asking for right now, if anything," sourced from the
 * same pending-queue poll the bell uses (lib/usePendingRequests, already
 * filtered against dismissed requests). Renders an honest empty state
 * instead of disappearing, so the hub always answers the question.
 */
export function AgentRequestsSection() {
  const pendingRequests = usePendingRequests();

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-(--dark-400)">Agent requests</p>

      {pendingRequests.length === 0 ? (
        <p className="text-sm text-(--dark-300)">No agents are requesting anything right now.</p>
      ) : (
        <div className="flex flex-col divide-y divide-(--dark-50)">
          {pendingRequests.map((request) => {
            const narrative = getActionNarrative(request.secretIdentifier);
            return (
              <div
                key={request.requestId}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-(--dark-400)">
                    {getAgentLabel(request.agentAddress)} wants {narrative.headline}
                  </p>
                  <p className="text-xs text-(--dark-300)">Waiting on your confirmation</p>
                </div>
                <Link
                  href="/agents"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-(--purple-500) px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6b4fe6]"
                >
                  Review
                  <HugeiconsIcon icon={ArrowRight02Icon} size={12} strokeWidth={2} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
