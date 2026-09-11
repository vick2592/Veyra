'use client';

import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';
import type { AccessRequest } from './AccessRequestToast';

/**
 * No tier/policy engine exists anywhere in the backend yet (CapabilityRegistry's
 * Tier enum is written but unwired). So this doesn't claim a trust tier the
 * user hasn't actually earned yet — it states the one real fact: the request
 * needs a human confirmation before it can run. Auto-advances (see
 * /request/page.tsx) instead of waiting on a click — there's no new decision
 * for the user to make here, just a beat worth showing before confirmation.
 */
export function TierPolicyResult({ request }: { request: AccessRequest }) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const agentLabel = getAgentLabel(request.agentAddress);

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-semibold text-(--dark-400)">Request evaluated</p>
        <p className="mt-2 text-sm leading-6 text-(--dark-300)">
          This request needs your confirmation before it can run.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded-full bg-(--purple-500)/10 px-3 py-1 text-xs font-semibold text-(--purple-500)">
          Allowed
        </span>
        <span className="text-sm text-(--dark-300)">pending your confirmation</span>
      </div>

      <div className="rounded-2xl border border-(--dark-50) bg-(--creame) p-4 text-sm">
        <div className="flex justify-between gap-4 border-b border-(--dark-50) pb-2">
          <span className="text-(--dark-300)">Agent</span>
          <span className="font-mono text-(--dark-400)">{agentLabel}</span>
        </div>
        <div className="flex justify-between gap-4 border-b border-(--dark-50) py-2">
          <span className="text-(--dark-300)">Action</span>
          <span className="font-mono text-(--dark-400)">{narrative.technical}</span>
        </div>
        <div className="flex justify-between gap-4 pt-2">
          <span className="text-(--dark-300)">Secret</span>
          <span className="font-mono text-(--dark-400)">{request.secretIdentifier}</span>
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-(--dark-300)">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--dark-50) border-t-(--purple-500)"
        />
        Continuing to confirmation...
      </p>
    </Card>
  );
}
