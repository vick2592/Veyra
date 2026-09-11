'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccessRequestToast, type AccessRequest } from '@/components/request/AccessRequestToast';
import { TierPolicyResult } from '@/components/request/TierPolicyResult';
import { HumanConfirmation } from '@/components/request/HumanConfirmation';
import { GrantedHighRisk } from '@/components/request/GrantedHighRisk';
import { DeniedExpired } from '@/components/request/DeniedExpired';
import { Card } from '@/components/ui/Card';
import { SplitScreenShell } from '@/components/ui/SplitScreenShell';

type PendingRequest = AccessRequest & {
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
};

type FlowStage = 'toast' | 'evaluating' | 'policy_result' | 'confirmation' | 'approved' | 'denied';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function fetchPendingRequests(signal?: AbortSignal): Promise<PendingRequest[]> {
  const response = await fetch(`${backendUrl}/api/bazantic/pending`, { signal });
  if (!response.ok) {
    throw new Error(`Pending requests failed with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { requests?: PendingRequest[] };
  return body.requests ?? [];
}

export default function RequestPage() {
  const router = useRouter();
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [stage, setStage] = useState<FlowStage>('toast');
  const [activeRequest, setActiveRequest] = useState<AccessRequest | null>(null);
  const [approvedTxHash, setApprovedTxHash] = useState<`0x${string}` | null>(null);
  const [deniedReason, setDeniedReason] = useState<'user_denied' | 'expired' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const stageRef = useRef<FlowStage>('toast');
  stageRef.current = stage;

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      try {
        const requests = await fetchPendingRequests(controller.signal);
        setPendingRequests(requests);
        setLoadError(null);
        if (stageRef.current === 'toast') {
          setSelectedRequestId((current) => {
            if (current !== null && requests.some((request) => request.requestId === current)) {
              return current;
            }
            return requests[0]?.requestId ?? null;
          });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadError(error instanceof Error ? error.message : 'Pending requests could not be loaded.');
        }
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const selectedRequest = pendingRequests.find((request) => request.requestId === selectedRequestId);
  const displayRequest = stage === 'toast' || stage === 'evaluating' ? selectedRequest : activeRequest;

  function handleEvaluate() {
    if (selectedRequest === undefined) {
      return;
    }
    setActiveRequest(selectedRequest);
    setStage('evaluating');
    window.setTimeout(() => setStage('policy_result'), 500);
  }

  function handleCancel() {
    router.push('/agents');
  }

  function handleContinueToConfirmation() {
    setStage('confirmation');
  }

  function handleApproved(txHash: `0x${string}`) {
    setApprovedTxHash(txHash);
    setStage('approved');
  }

  function handleDenied(reason: 'user_denied' | 'expired') {
    setDeniedReason(reason);
    setStage('denied');
  }

  function handleReset() {
    router.push('/agents');
  }

  return (
    <SplitScreenShell>
      {displayRequest === undefined || displayRequest === null ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-(--dark-300)">
            {loadError ?? 'No pending requests right now.'}
          </p>
          <Link href="/agents" className="text-sm font-semibold text-(--purple-500)">
            Back to agents
          </Link>
        </Card>
      ) : stage === 'toast' || stage === 'evaluating' ? (
        <AccessRequestToast
          request={displayRequest}
          isEvaluating={stage === 'evaluating'}
          onEvaluate={handleEvaluate}
          onCancel={handleCancel}
        />
      ) : stage === 'policy_result' ? (
        <TierPolicyResult request={displayRequest} onContinue={handleContinueToConfirmation} />
      ) : stage === 'confirmation' ? (
        <HumanConfirmation request={displayRequest} onApproved={handleApproved} onDenied={handleDenied} />
      ) : stage === 'approved' && approvedTxHash !== null ? (
        <GrantedHighRisk request={displayRequest} txHash={approvedTxHash} onDone={handleReset} />
      ) : stage === 'denied' && deniedReason !== null ? (
        <DeniedExpired request={displayRequest} reason={deniedReason} onBack={handleReset} />
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
