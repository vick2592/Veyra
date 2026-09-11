'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ShieldUserIcon } from '@hugeicons/core-free-icons';
import { Modal } from '@/components/ui/Modal';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';

export type AccessRequest = {
  requestId: string;
  agentAddress: string;
  secretIdentifier: string;
  expiresAt: string;
};

/**
 * Figma (node 66:7245) draws this frame with the Agent/Action/Resource/
 * Parameters block as bare labels, no values — a skeleton, not a finished
 * state. Built here with the real values filled in instead of copied as-is.
 */
export function AccessRequestModal({
  open,
  request,
  isEvaluating,
  onEvaluate,
  onCancel,
}: {
  open: boolean;
  request: AccessRequest | null;
  isEvaluating: boolean;
  onEvaluate: () => void;
  onCancel: () => void;
}) {
  if (request === null) {
    return null;
  }

  const narrative = getActionNarrative(request.secretIdentifier);
  const agentLabel = getAgentLabel(request.agentAddress);

  return (
    <Modal open={open} onClose={isEvaluating ? undefined : onCancel}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--dark-500) text-white">
          <HugeiconsIcon icon={ShieldUserIcon} size={28} strokeWidth={1.5} />
        </span>
        <h2 className="mt-2 text-3xl font-semibold text-(--dark-500)">Permission requested</h2>
        <p className="text-sm leading-6 text-(--dark-300)">
          {agentLabel} is asking for permission, not for a key.
        </p>
      </div>

      <div className="mt-6 rounded-3xl border border-(--dark-50) bg-white p-6 text-sm">
        <div className="flex justify-between gap-4 border-b border-(--dark-50) pb-3">
          <span className="text-(--dark-300)">Agent</span>
          <span className="font-mono text-(--dark-400)">{agentLabel}</span>
        </div>
        <div className="flex justify-between gap-4 border-b border-(--dark-50) py-3">
          <span className="text-(--dark-300)">Action</span>
          <span className="font-mono text-(--dark-400)">{narrative.technical}</span>
        </div>
        <div className="flex justify-between gap-4 pt-3">
          <span className="text-(--dark-300)">Secret</span>
          <span className="font-mono text-(--dark-400)">{request.secretIdentifier}</span>
        </div>
      </div>

      <div className="mt-5 text-center">
        <p className="text-base font-semibold text-(--dark-400)">{narrative.headline}</p>
        {narrative.detail.length > 0 && <p className="mt-1 text-sm text-(--dark-300)">{narrative.detail}</p>}
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={onEvaluate}
          disabled={isEvaluating}
          className="flex-1 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isEvaluating ? 'Evaluating...' : 'Evaluate request'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isEvaluating}
          className="flex-1 rounded-full border border-(--purple-500) px-6 py-4 text-sm font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
