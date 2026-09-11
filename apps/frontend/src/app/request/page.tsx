'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AccessRequest } from '@/components/request/AccessRequestModal';
import { TierPolicyResult } from '@/components/request/TierPolicyResult';
import { HumanConfirmation } from '@/components/request/HumanConfirmation';
import { GrantedHighRisk } from '@/components/request/GrantedHighRisk';
import { DeniedExpired } from '@/components/request/DeniedExpired';
import { Card } from '@/components/ui/Card';
import { SplitScreenShell } from '@/components/ui/SplitScreenShell';

type FlowStage = 'policy_result' | 'confirmation' | 'approved' | 'denied';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function fetchRequest(requestId: string, signal?: AbortSignal): Promise<AccessRequest> {
  const response = await fetch(`${backendUrl}/api/bazantic/requests/${requestId}`, { signal });
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Request not found. It may have expired.' : `Request lookup failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as AccessRequest;
}

function RequestFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get('requestId');

  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<FlowStage>('policy_result');
  const [approvedTxHash, setApprovedTxHash] = useState<`0x${string}` | null>(null);
  const [deniedReason, setDeniedReason] = useState<'user_denied' | 'expired' | null>(null);

  useEffect(() => {
    if (requestId === null) {
      setLoadError('No request selected.');
      return;
    }
    const controller = new AbortController();
    fetchRequest(requestId, controller.signal)
      .then((result) => setRequest(result))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadError(error instanceof Error ? error.message : 'Request could not be loaded.');
        }
      });
    return () => controller.abort();
  }, [requestId]);

  // No new decision happens on the policy-result screen (no real tier/policy
  // engine to wait on) — it auto-advances into confirmation after a beat
  // instead of making the user click through a screen with nothing to decide.
  useEffect(() => {
    if (stage !== 'policy_result' || request === null) {
      return;
    }
    const timeout = window.setTimeout(() => setStage('confirmation'), 1_600);
    return () => window.clearTimeout(timeout);
  }, [stage, request]);

  function handleApproved(txHash: `0x${string}`) {
    setApprovedTxHash(txHash);
    setStage('approved');
  }

  function handleDenied(reason: 'user_denied' | 'expired') {
    setDeniedReason(reason);
    setStage('denied');
  }

  function handleContinueToArchitecture() {
    router.push('/architecture');
  }

  return (
    <SplitScreenShell>
      {request === null ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-(--dark-300)">{loadError ?? 'Loading request...'}</p>
          <Link href="/agents" className="text-sm font-semibold text-(--purple-500)">
            Back to agents
          </Link>
        </Card>
      ) : stage === 'policy_result' ? (
        <TierPolicyResult request={request} />
      ) : stage === 'confirmation' ? (
        <HumanConfirmation request={request} onApproved={handleApproved} onDenied={handleDenied} />
      ) : stage === 'approved' && approvedTxHash !== null ? (
        <GrantedHighRisk request={request} txHash={approvedTxHash} onContinue={handleContinueToArchitecture} />
      ) : stage === 'denied' && deniedReason !== null ? (
        <DeniedExpired request={request} reason={deniedReason} onContinue={handleContinueToArchitecture} />
      ) : null}

      <Link
        href="/sandbox"
        className="mt-6 block text-center text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
      >
        Open developer sandbox
      </Link>
    </SplitScreenShell>
  );
}

export default function RequestPage() {
  return (
    <Suspense fallback={null}>
      <RequestFlow />
    </Suspense>
  );
}
