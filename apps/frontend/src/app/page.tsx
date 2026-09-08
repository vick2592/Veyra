'use client';

import { useState } from 'react';
import { IDKitWidget, type IErrorState, type ISuccessResult, VerificationLevel } from '@worldcoin/idkit';

type RequestState = 'idle' | 'submitting' | 'success' | 'error';

const worldAppId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? '';
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export default function Home() {
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [message, setMessage] = useState('');

  async function handleSuccess(result: ISuccessResult) {
    setRequestState('submitting');
    setMessage('Proof received. Asking the broker to authorize execution...');

    try {
      const response = await fetch(`${backendUrl}/api/execute-agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'execute-agent',
          proof: result.proof,
          merkle_root: result.merkle_root,
          nullifier_hash: result.nullifier_hash,
          verification_level: result.verification_level,
        }),
      });

      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'The broker rejected the execution request.');
      }

      setRequestState('success');
      setMessage('Execution authorized. The broker completed the agent request.');
    } catch (error) {
      setRequestState('error');
      setMessage(error instanceof Error ? error.message : 'The broker request failed.');
    }
  }

  function handleError(error: IErrorState) {
    setRequestState('error');
    setMessage(error.message ?? `World ID verification failed: ${error.code}.`);
  }

  const isBusy = requestState === 'submitting';
  const hasAppId = worldAppId.startsWith('app_');

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between rounded-4xl border border-(--line) bg-[rgba(255,253,246,0.66)] p-6 shadow-[0_24px_80px_rgba(23,33,27,0.12)] backdrop-blur sm:min-h-[calc(100vh-5rem)] sm:p-10">
        <header className="flex items-center justify-between border-b border-(--line) pb-5">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em]">
            <span className="h-3 w-3 rounded-full bg-(--lime) ring-4 ring-[rgba(217,242,106,0.28)]" />
            Veyra
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-(--muted)">Human gate / 01</span>
        </header>

        <section className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-(--muted)">Agent capability broker</p>
            <h1 className="max-w-3xl text-5xl leading-[0.96] tracking-[-0.03em] sm:text-7xl">
              Give the agent a green light.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-(--muted) sm:text-xl">
              Confirm you are present with World ID Face Auth before Veyra releases a narrowly scoped capability to the agent.
            </p>
          </div>

          <div className="border-l border-(--line) pl-6 lg:mb-1">
            <p className="text-sm leading-6 text-(--muted)">
              The proof is checked by the Veyra broker. Raw API keys remain outside the browser and are never handed to the agent.
            </p>
          </div>
        </section>

        <section className="grid gap-5 border-t border-(--line) pt-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div aria-live="polite">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Requested action</p>
            <p className="mt-2 text-2xl">Execute agent capability</p>
            {message && (
              <p className={`mt-3 max-w-xl text-sm ${requestState === 'error' ? 'text-[#a83f31]' : requestState === 'success' ? 'text-[#28734a]' : 'text-(--muted)'}`}>
                {message}
              </p>
            )}
          </div>

          <IDKitWidget
            app_id={worldAppId as `app_${string}`}
            action="execute-agent"
            verification_level={VerificationLevel.Orb}
            onSuccess={handleSuccess}
            onError={handleError}
            autoClose
          >
            {({ open }) => (
              <button
                type="button"
                onClick={open}
                disabled={!hasAppId || isBusy}
                className="min-w-56 rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isBusy ? 'Authorizing...' : 'Authorize execution'}
              </button>
            )}
          </IDKitWidget>
        </section>
      </div>
    </main>
  );
}
