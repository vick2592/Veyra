'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { Robot01Icon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { AccessRequestModal, type PendingRequest } from '@/components/request/AccessRequestModal';
import { AgentDetailDrawer } from '@/components/agents/AgentDetailDrawer';
import { RegisterAgentModal } from '@/components/agents/RegisterAgentModal';
import { StatusPill, type AgentStatus } from '@/components/agents/StatusPill';
import { DEMO_AGENT_ADDRESS, getAgentLabel } from '@/lib/demoNarrative';
import { addRegisteredAgent, getRegisteredAgents } from '@/lib/agentDirectory';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

type DemoAgent = {
  address: string;
  label: string;
  status: AgentStatus;
  description: string;
  isLocal?: boolean;
};

/**
 * The registry has no on-chain registration mechanism (see
 * lib/demoNarrative.ts) and no revocation-status read is wired here yet,
 * so the demo agent's status is honestly presented — "active" is the true
 * default: this address has never been revoked. Agents beyond this one
 * come from the viewer's own local directory (lib/agentDirectory.ts),
 * added via "Register agent" — a personal list, not an on-chain roster.
 */
const demoAgent: DemoAgent = {
  address: DEMO_AGENT_ADDRESS,
  label: getAgentLabel(DEMO_AGENT_ADDRESS),
  status: 'active',
  description: 'Built-in demo agent — open it to simulate a request against any of your secrets.',
};

const filters: { key: 'all' | AgentStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'revoked', label: 'Revoked' },
];

export default function AgentsPage() {
  const router = useRouter();
  const { address: ownerAddress } = useAccount();
  const [activeFilter, setActiveFilter] = useState<'all' | AgentStatus>('all');
  const [modalRequest, setModalRequest] = useState<PendingRequest | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = useState<DemoAgent | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [localAgents, setLocalAgents] = useState<DemoAgent[]>([]);

  useEffect(() => {
    if (ownerAddress === undefined) {
      setLocalAgents([]);
      return;
    }
    setLocalAgents(
      getRegisteredAgents(ownerAddress).map((agent) => ({
        address: agent.address,
        label: agent.label,
        status: 'active',
        description: 'Added by you — a personal record, not an on-chain permission.',
        isLocal: true,
      })),
    );
  }, [ownerAddress]);

  const agents: DemoAgent[] = [demoAgent, ...localAgents];

  function handleRegisterAgent(agent: { address: string; label: string }) {
    if (ownerAddress === undefined) {
      return;
    }
    const updated = addRegisteredAgent(ownerAddress, agent);
    setLocalAgents(
      updated.map((entry) => ({
        address: entry.address,
        label: entry.label,
        status: 'active',
        description: 'Added by you — a personal record, not an on-chain permission.',
        isLocal: true,
      })),
    );
  }

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
    <DashboardShell title="Agents">
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
          onClick={() => setIsRegisterOpen(true)}
          disabled={ownerAddress === undefined}
          title={ownerAddress === undefined ? 'Connect your wallet first' : undefined}
          className="inline-flex items-center justify-center rounded-full bg-(--purple-500) px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-50"
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
                  {agent.isLocal === true && (
                    <span
                      title="Added by you, on this device — not an on-chain permission."
                      className="rounded-full bg-(--dark-50) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-(--dark-300)"
                    >
                      Local
                    </span>
                  )}
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

      <AccessRequestModal
        open={modalRequest !== null}
        request={modalRequest}
        isEvaluating={isEvaluating}
        onEvaluate={handleEvaluateRequest}
        onCancel={handleCancelRequest}
      />

      <AgentDetailDrawer
        open={detailAgent !== null}
        agent={detailAgent}
        onClose={() => setDetailAgent(null)}
        disableSimulate={modalRequest !== null}
        onSimulated={(request) => {
          setModalRequest(request);
          setDetailAgent(null);
        }}
      />

      <RegisterAgentModal
        open={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegister={handleRegisterAgent}
      />
    </DashboardShell>
  );
}
