'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HumanConfirmation } from '@/components/request/HumanConfirmation';
import type { AccessRequest } from '@/components/request/AccessRequestModal';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const dummyAgentAddress = '0x0000000000000000000000000000000000000001';

type Stage = 'idle' | 'requesting' | 'confirming' | 'executing' | 'completed' | 'failed';

/**
 * Reuses /request's HumanConfirmation for the real World ID + on-chain
 * authorize flow, rather than re-deriving /sandbox's mechanics a third time
 * — same pattern lib/worldIdAuthorization.ts already establishes (duplicate
 * the small mechanics, don't duplicate the whole flow).
 *
 * The backend's execute-agent action only ever decrypts one shared operator
 * key (see keyring.ts) — it does not yet look up the per-user secret this
 * label refers to. So this card proves the authorization pipeline the new
 * secret feeds into, not that this specific ciphertext was decrypted.
 */
export function AgentExecutionCard({
  secretLabel,
  onAuthorized,
  onExecuted,
}: {
  secretLabel: string;
  onAuthorized: () => void;
  onExecuted: () => void;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleTrigger() {
    setStage('requesting');
    setErrorMessage(null);
    setResult(null);
    try {
      const idempotencyKey = `dashboard-${crypto.randomUUID()}`;
      const paymentReference = `dashboard-payment-${Date.now()}`;
      const response = await fetch(`${backendUrl}/api/bazantic/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Payment-Signature': paymentReference,
          'X-PAYMENT': paymentReference,
          'x-payment-reference': paymentReference,
        },
        body: JSON.stringify({ secretIdentifier: secretLabel, agentAddress: dummyAgentAddress, idempotencyKey }),
      });
      const body = (await response.json().catch(() => null)) as
        | { requestId?: string; expiresAt?: string; error?: string }
        | null;
      if (!response.ok || body?.requestId === undefined) {
        throw new Error(body?.error ?? `Agent request failed with HTTP ${response.status}.`);
      }

      setRequest({
        requestId: body.requestId,
        agentAddress: dummyAgentAddress,
        secretIdentifier: secretLabel,
        expiresAt: body.expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
      });
      setStage('confirming');
    } catch (error) {
      setStage('failed');
      setErrorMessage(error instanceof Error ? error.message : 'The agent request could not be sent.');
    }
  }

  function handleApproved() {
    onAuthorized();
    setStage('executing');
  }

  function handleDenied(reason: 'user_denied' | 'expired') {
    setErrorMessage(reason === 'expired' ? 'The confirmation window expired.' : 'Authorization was denied.');
    setRequest(null);
    setStage('failed');
  }

  useEffect(() => {
    if (stage !== 'executing' || request === null) {
      return;
    }
    const controller = new AbortController();
    let active = true;

    async function poll() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/requests/${request?.requestId}`, {
          signal: controller.signal,
        });
        if (!response.ok || !active) {
          return;
        }
        const body = (await response.json()) as { status: string; result?: unknown; error?: { message: string } };
        if (!active) {
          return;
        }
        if (body.status === 'completed') {
          setResult(body.result);
          setStage('completed');
          onExecuted();
        } else if (body.status === 'failed') {
          setErrorMessage(body.error?.message ?? 'The capability execution failed.');
          setStage('failed');
        }
      } catch {
        // Best-effort — the next tick retries.
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 3_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, request]);

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-semibold text-(--dark-400)">Test your agent</p>
        <p className="mt-1 text-sm text-(--dark-300)">
          Runs the same World ID authorization pipeline your <span className="font-mono">{secretLabel}</span> secret
          feeds into, end to end on Base Sepolia.
        </p>
      </div>

      {stage === 'idle' || stage === 'requesting' || stage === 'failed' ? (
        <div className="flex flex-col gap-3">
          <Button onClick={() => void handleTrigger()} loading={stage === 'requesting'} loadingLabel="Sending request...">
            Simulate agent request
          </Button>
          {errorMessage !== null && <p className="text-sm text-(--dark-400)">{errorMessage}</p>}
        </div>
      ) : stage === 'confirming' && request !== null ? (
        <HumanConfirmation request={request} onApproved={handleApproved} onDenied={handleDenied} />
      ) : stage === 'executing' ? (
        <p className="text-sm text-(--dark-300)">Authorized. Waiting for the chain listener to execute...</p>
      ) : stage === 'completed' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-(--dark-400)">Capability completed.</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-(--creame) p-4 text-xs leading-6 text-(--dark-400)">
            {JSON.stringify(result, null, 2)}
          </pre>
          <Button
            variant="secondary"
            onClick={() => {
              setStage('idle');
              setRequest(null);
              setResult(null);
            }}
          >
            Run again
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
