'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Robot01Icon, SentIcon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DEMO_AGENT_ADDRESS, DEMO_SECRET_IDENTIFIER, getAgentLabel } from '@/lib/demoNarrative';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export default function AgentsPage() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const agentLabel = getAgentLabel(DEMO_AGENT_ADDRESS);

  useEffect(() => {
    const controller = new AbortController();

    async function refreshPendingCount() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/pending`, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { requests?: unknown[] };
        setPendingCount(body.requests?.length ?? 0);
      } catch {
        // Best-effort — the bell just won't update this tick.
      }
    }

    void refreshPendingCount();
    const interval = window.setInterval(() => void refreshPendingCount(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  async function handleSimulate() {
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      const idempotencyKey = `agents-${crypto.randomUUID()}`;
      const paymentReference = `agents-payment-${Date.now()}`;
      const response = await fetch(`${backendUrl}/api/bazantic/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Payment-Signature': paymentReference,
          'X-PAYMENT': paymentReference,
          'x-payment-reference': paymentReference,
        },
        body: JSON.stringify({
          secretIdentifier: DEMO_SECRET_IDENTIFIER,
          agentAddress: DEMO_AGENT_ADDRESS,
          idempotencyKey,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed with HTTP ${response.status}.`);
      }
      router.push('/request');
    } catch (error) {
      setIsSimulating(false);
      setErrorMessage(error instanceof Error ? error.message : 'The request could not be sent.');
    }
  }

  return (
    <DashboardShell title="Agents" pendingCount={pendingCount}>
      <p className="mb-8 max-w-md text-sm leading-6 text-(--dark-300)">
        Agents that can request access to your secrets.
      </p>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
            <HugeiconsIcon icon={Robot01Icon} size={18} strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-base font-medium text-(--dark-400)">{agentLabel}</p>
            <p className="font-mono text-xs text-(--dark-300)">
              {DEMO_AGENT_ADDRESS.slice(0, 6)}...{DEMO_AGENT_ADDRESS.slice(-4)}
            </p>
          </div>
          <span className="rounded-full bg-(--purple-500)/10 px-3 py-1 text-xs font-semibold text-(--purple-500)">
            Active
          </span>
        </div>

        <Button
          variant="primary"
          icon={SentIcon}
          loading={isSimulating}
          loadingLabel="Sending request..."
          onClick={() => void handleSimulate()}
        >
          Simulate agent request
        </Button>
      </Card>

      {errorMessage !== null && <p className="mt-4 text-sm text-(--dark-400)">{errorMessage}</p>}
    </DashboardShell>
  );
}
