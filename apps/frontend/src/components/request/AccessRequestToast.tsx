'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon, Robot01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';

export type AccessRequest = {
  requestId: string;
  agentAddress: string;
  secretIdentifier: string;
  expiresAt: string;
};

export function AccessRequestToast({
  request,
  isEvaluating,
  onEvaluate,
  onCancel,
}: {
  request: AccessRequest;
  isEvaluating: boolean;
  onEvaluate: () => void;
  onCancel: () => void;
}) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const agentLabel = getAgentLabel(request.agentAddress);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-(--dark-400)">Permission requested</p>
        <div className="flex items-center gap-2 text-xs text-(--dark-300)">
          <HugeiconsIcon icon={Robot01Icon} size={16} strokeWidth={1.5} />
          {agentLabel}
        </div>
      </div>

      <p className="text-sm leading-6 text-(--dark-300)">
        An agent wants to do something on your behalf. Review it, then decide.
      </p>

      <div>
        <p className="text-xl font-semibold text-(--blue-500)">{narrative.headline}</p>
        {narrative.detail.length > 0 && (
          <p className="mt-1 text-sm text-(--dark-300)">{narrative.detail}</p>
        )}
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

      <div className="flex items-center gap-4">
        <Button
          variant="primary"
          icon={ArrowRight02Icon}
          iconPosition="trailing"
          loading={isEvaluating}
          loadingLabel="Evaluating request..."
          onClick={onEvaluate}
        >
          Evaluate request
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isEvaluating}
          className="text-sm font-semibold text-(--dark-300) hover:text-(--dark-400) disabled:opacity-45"
        >
          Cancel
        </button>
      </div>
    </Card>
  );
}
