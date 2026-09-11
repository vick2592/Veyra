'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import { Robot01Icon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { AccessRequestModal, type AccessRequest } from '@/components/request/AccessRequestModal';
import { AgentDetailDrawer } from '@/components/agents/AgentDetailDrawer';
import { StatusPill, type AgentStatus } from '@/components/agents/StatusPill';
import { DEMO_AGENT_ADDRESS, DEMO_SECRET_IDENTIFIER, getAgentLabel } from '@/lib/demoNarrative';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

type PendingRequest = AccessRequest & {
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
};

type DemoAgent = {
  address: string;
  label: string;
  status: AgentStatus;
  description: string;
};

/**
 * The registry has no real registration mechanism (see lib/demoNarrative.ts)
 * and no revocation-status read is wired here yet, so this is the one demo
 * agent, honestly presented — not a fabricated roster of three like the
 * Figma sample data. "active" is the true default: this address has never
 * been revoked.
 */
const agents: DemoAgent[] = [
  {
    address: DEMO_AGENT_ADDRESS,
    label: getAgentLabel(DEMO_AGENT_ADDRESS),
    status: 'active',
    description: `Requests access to ${DEMO_SECRET_IDENTIFIER}`,
  },
];

const filters: { key: 'all' | AgentStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'revoked', label: 'Revoked' },
];

export default function AgentsPage() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | AgentStatus>('all');
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalRequest, setModalRequest] = useState<PendingRequest | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = useState<DemoAgent | null>(null);

  // Access Request is a modal, not a page (matches its Figma surface type) —
  // it opens here on /agents rather than at the top of a separate route.
  // Polling still runs so a request from a real, non-simulated agent surfaces
  // it too, not just the ones this page's own button creates.
  useEffect(() => {
    const controller = new AbortController();

    async function refreshPending() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/pending`, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { requests?: PendingRequest[] };
        const requests = body.requests ?? [];
        setPendingCount(requests.length);
        setModalRequest((current) => {
          if (current !== null) {
            return current;
          }
          return requests.find((request) => !dismissedIds.has(request.requestId)) ?? null;
        });
      } catch {
        // Best-effort — the bell just won't update this tick.
      }
    }

    void refreshPending();
    const interval = window.setInterval(() => void refreshPending(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [dismissedIds]);

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
      const body = (await response.json().catch(() => null)) as (PendingRequest & { error?: string }) | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Request failed with HTTP ${response.status}.`);
      }
      if (body !== null) {
        setModalRequest(body);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The request could not be sent.');
    } finally {
      setIsSimulating(false);
    }
  }

  function handleCancelRequest() {
    if (modalRequest !== null) {
      setDismissedIds((current) => new Set(current).add(modalRequest.requestId));
    }
    setModalRequest(null);
  }

  function handleEvaluateRequest() {
    if (modalRequest === null) {
      return;
    }
    setIsEvaluating(true);
    window.setTimeout(() => {
      router.push(`/request?requestId=${encodeURIComponent(modalRequest.requestId)}`);
    }, 400);
  }

  const visibleAgents = agents.filter((agent) => activeFilter === 'all' || agent.status === activeFilter);

  return (
    <DashboardShell title="Agents" pendingCount={pendingCount}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Manage Your Agents</h2>
          <p className="mt-2 text-sm text-(--dark-300)">Agents connected to your verified identity.</p>
        </div>

        <div className="flex items-center gap-1 rounded-2xl border border-(--dark-50) p-1.5">
          {filters.map((filter) => {
            const count = agents.filter((agent) => filter.key === 'all' || agent.status === filter.key).length;
            const isSelected = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isSelected ? 'bg-(--dark-500) text-white' : 'text-(--dark-400) hover:bg-(--dark-50)'
                }`}
              >
                {filter.label}
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                    isSelected ? 'bg-white/20' : 'bg-(--dark-50)'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled
          title="No registration step exists yet — any address can already request access; a human decides per request."
          className="inline-flex items-center justify-center rounded-full bg-(--purple-500)/40 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed"
        >
          Register agent
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleAgents.map((agent) => (
          <Card key={agent.address} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
                <HugeiconsIcon icon={Robot01Icon} size={18} strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-(--dark-400)">{agent.label}</p>
                  <StatusPill status={agent.status} />
                </div>
                <p className="truncate font-mono text-xs text-(--dark-300)">
                  {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-(--dark-50) pt-4">
              <p className="text-sm text-(--dark-300)">{agent.description}</p>
              <button
                type="button"
                onClick={() => setDetailAgent(agent)}
                className="shrink-0 rounded-full bg-(--purple-500) px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6b4fe6]"
              >
                View agent
              </button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void handleSimulate()}
          disabled={isSimulating || modalRequest !== null}
          title={modalRequest !== null ? 'Resolve the open request first' : undefined}
          className="inline-flex items-center justify-center rounded-full border border-(--purple-500) px-6 py-3 text-sm font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSimulating ? 'Sending request...' : 'Simulate agent request'}
        </button>
        {errorMessage !== null && <p className="text-sm text-(--dark-400)">{errorMessage}</p>}
      </div>

      <AccessRequestModal
        open={modalRequest !== null}
        request={modalRequest}
        isEvaluating={isEvaluating}
        onEvaluate={handleEvaluateRequest}
        onCancel={handleCancelRequest}
      />

      <AgentDetailDrawer open={detailAgent !== null} agent={detailAgent} onClose={() => setDetailAgent(null)} />
    </DashboardShell>
  );
}
