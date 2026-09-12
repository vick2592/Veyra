'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { getActionNarrative } from '@/lib/demoNarrative';
import type { AccessRequest } from './AccessRequestModal';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

type ExecutionState = 'executing' | 'completed' | 'failed';

type ExecutionStatus = {
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: { code?: string; message: string };
};

/**
 * The authorize tx confirming only means the on-chain event fired — the
 * chain listener still has to pick it up and execute the capability. So
 * this polls the real request status instead of assuming success the
 * moment HumanConfirmation hands off a confirmed tx hash.
 */
export function GrantedHighRisk({
  request,
  txHash,
  onContinue,
}: {
  request: AccessRequest;
  txHash: `0x${string}`;
  onContinue: () => void;
}) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const [execution, setExecution] = useState<ExecutionState>('executing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function poll() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/requests/${request.requestId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Execution status failed with HTTP ${response.status}.`);
        }
        const body = (await response.json()) as ExecutionStatus;
        if (!active) {
          return;
        }
        if (body.status === 'completed') {
          setExecution('completed');
        } else if (body.status === 'failed') {
          setExecution('failed');
          setError(body.error?.message ?? 'The capability execution failed.');
        }
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError') && active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Execution status could not be loaded.');
        }
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 2_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [request.requestId]);

  return (
    <div className="animate-veyra-fade-in flex flex-col items-center text-center">
      <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        {execution === 'executing' ? 'Executing on-chain...' : execution === 'completed' ? 'Action approved' : 'Approved, but execution failed'}
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">
        {execution === 'executing'
          ? 'Confirmed with World ID and your wallet signature. Waiting for the chain listener to execute the request.'
          : execution === 'completed'
            ? 'Confirmed with World ID and your wallet signature. Veyra executed the request. No key was ever exposed.'
            : (error ?? 'The request was authorized, but execution failed after approval.')}
      </p>

      <div className="mt-10 w-full rounded-2xl border border-(--dark-50) bg-white p-6">
        <p className="font-mono text-sm text-(--dark-400)">{narrative.technical}</p>
        <p className="mt-2 font-mono text-sm text-(--dark-400)">{narrative.headline}</p>
        <p className="mt-2 break-all font-mono text-xs text-(--dark-300)">{txHash}</p>
      </div>

      {execution !== 'executing' && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-10 inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
        >
          Continue
          <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
