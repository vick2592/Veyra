'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Robot01Icon } from '@hugeicons/core-free-icons';
import { useAccount, usePublicClient } from 'wagmi';
import { Drawer } from '@/components/ui/Drawer';
import { StatusPill, type AgentStatus } from './StatusPill';
import { getActionNarrative } from '@/lib/demoNarrative';
import { registryAddress } from '@/lib/worldIdAuthorization';
import { fetchAgentAuthorizedLogs, formatRelativeTime, resolveSecretLabel, type ActivityEntry } from '@/lib/activityLog';

export type DrawerAgent = {
  address: string;
  label: string;
  status: AgentStatus;
  description: string;
};

export function AgentDetailDrawer({
  open,
  agent,
  onClose,
}: {
  open: boolean;
  agent: DrawerAgent | null;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [recent, setRecent] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!open || agent === null || !isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setRecent(null);
      return;
    }
    let active = true;
    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (!active) return;
        const forThisAgent = logs
          .filter((entry) => entry.agentAddress.toLowerCase() === agent.address.toLowerCase())
          .sort((a, b) => Number(b.authorizedAt) - Number(a.authorizedAt))
          .slice(0, 2);
        setRecent(forThisAgent);
      })
      .catch(() => active && setRecent([]));
    return () => {
      active = false;
    };
  }, [open, agent, address, isConnected, publicClient]);

  if (agent === null) {
    return null;
  }

  return (
    <Drawer open={open} onClose={onClose}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--dark-500) text-white">
            <HugeiconsIcon icon={Robot01Icon} size={20} strokeWidth={1.5} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-(--dark-400)">{agent.label}</p>
              <StatusPill status={agent.status} />
            </div>
            <p className="font-mono text-xs text-(--dark-300)">
              {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-(--dark-300) hover:bg-(--dark-50)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-(--dark-300)">{agent.description}</p>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">Recent activity</p>
        <div className="mt-3 flex flex-col gap-2">
          {recent === null ? (
            <p className="text-sm text-(--dark-300)">Loading...</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-(--dark-300)">No activity yet.</p>
          ) : (
            recent.map((entry) => {
              const narrative = getActionNarrative(resolveSecretLabel(entry.secretId));
              return (
                <div
                  key={entry.requestId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-(--dark-50) bg-white px-4 py-3 text-xs"
                >
                  <span className="truncate font-mono text-(--dark-400)">{narrative.technical}</span>
                  <span className="shrink-0 rounded-full bg-(--purple-500)/10 px-2 py-0.5 font-semibold text-(--purple-500)">
                    Allowed
                  </span>
                  <span className="shrink-0 text-(--dark-300)">{formatRelativeTime(entry.authorizedAt)}</span>
                </div>
              );
            })
          )}
        </div>
        <Link href="/activity" className="mt-3 inline-block text-xs font-semibold text-(--purple-500)">
          View all activity
        </Link>
      </div>

      <div className="mt-10">
        <button
          type="button"
          disabled
          title="Revoking is an owner-only kill switch on CapabilityRegistry, not a per-user action yet — no wallet connected here can call it."
          className="w-full rounded-full bg-(--dark-500)/40 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed"
        >
          {agent.status === 'active' ? 'Revoke agent' : 'Reinstate agent'}
        </button>
      </div>
    </Drawer>
  );
}
