'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ArrowRight02Icon, LinkSquare02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/Button';
import { getActionNarrative } from '@/lib/demoNarrative';
import type { AccessRequest } from './AccessRequestModal';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

/** Past this many seconds still executing, the copy admits it's slower than
 * usual instead of leaving the spinner to speak for itself. */
const SLOW_THRESHOLD_SECONDS = 15;

type ExecutionState = 'executing' | 'completed' | 'failed';

type ExecutionStatus = {
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: { code?: string; message: string };
};

function StatusIcon({ state }: { state: ExecutionState }) {
  if (state === 'completed') {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-(--purple-500) text-white">
        <HugeiconsIcon icon={Tick02Icon} size={28} strokeWidth={2} />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-(--dark-50) text-(--dark-400)">
        <HugeiconsIcon icon={Alert02Icon} size={26} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span className="relative flex h-16 w-16 items-center justify-center" role="status" aria-label="Executing">
      <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-(--dark-50)" />
      <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-4 border-(--purple-500) border-t-transparent" />
    </span>
  );
}

/**
 * The authorize tx confirming only means the on-chain event fired — the
 * chain listener still has to pick it up and execute the capability. So
 * this polls the real request status instead of assuming success the
 * moment HumanConfirmation hands off a confirmed tx hash.
 *
 * A silent, CTA-less spinner here reads as broken if the listener is slow
 * or misconfigured (a real failure mode this build has hit) — so this shows
 * elapsed time, admits when it's running long, and always gives a way to
 * leave the screen without losing the request (it keeps executing in the
 * background regardless of whether anyone's watching this page).
 */
export function GrantedHighRisk({
  request,
  txHash,
  onContinue,
  onLeave,
}: {
  request: AccessRequest;
  txHash: `0x${string}`;
  onContinue: () => void;
  onLeave: () => void;
}) {
  const narrative = getActionNarrative(request.secretIdentifier);
  const [execution, setExecution] = useState<ExecutionState>('executing');
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  useEffect(() => {
    if (execution !== 'executing') {
      return;
    }
    const interval = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [execution]);

  const isSlow = execution === 'executing' && elapsedSeconds >= SLOW_THRESHOLD_SECONDS;

  return (
    <div className="animate-veyra-fade-in flex flex-col items-center text-center">
      <StatusIcon state={execution} />

      <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        {execution === 'executing' ? 'Executing on-chain...' : execution === 'completed' ? 'Action approved' : 'Approved, but execution failed'}
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">
        {execution === 'executing'
          ? 'Confirmed with World ID and your wallet signature. Waiting for the chain listener to execute the request.'
          : execution === 'completed'
            ? 'Confirmed with World ID and your wallet signature. Veyra executed the request. No key was ever exposed.'
            : (error ?? 'The request was authorized, but execution failed after approval.')}
      </p>
      {execution === 'executing' && (
        <p className="mt-2 text-xs text-(--dark-300)">Checking every couple seconds · {elapsedSeconds}s elapsed</p>
      )}
      {isSlow && (
        <p className="mt-4 max-w-md text-sm text-(--dark-300)">
          This is taking longer than usual. It's safe to leave — Veyra keeps processing in the background and this will show up in Activity once it's done.
        </p>
      )}

      <div className="mt-10 w-full rounded-2xl border border-(--dark-50) bg-white p-6">
        <p className="font-mono text-sm text-(--dark-400)">{narrative.technical}</p>
        <p className="mt-2 font-mono text-sm text-(--dark-400)">{narrative.headline}</p>
        <p className="mt-2 break-all font-mono text-xs text-(--dark-300)">{txHash}</p>
        <a
          href={`https://sepolia.basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-(--purple-500) hover:text-[#6b4fe6]"
        >
          View on BaseScan
          <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={2} />
        </a>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        {execution !== 'executing' ? (
          <Button icon={ArrowRight02Icon} iconPosition="trailing" onClick={onContinue}>
            Continue
          </Button>
        ) : (
          <button
            type="button"
            onClick={onLeave}
            className="text-sm font-semibold text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
          >
            Continue in the background
          </button>
        )}
      </div>
    </div>
  );
}
