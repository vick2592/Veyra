'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { useAccount, usePublicClient } from 'wagmi';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';
import { registryAddress } from '@/lib/worldIdAuthorization';
import { fetchAgentAuthorizedLogs, formatRelativeTime, resolveSecretLabel, type ActivityEntry } from '@/lib/activityLog';

export default function ActivityPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setEntries(null);
      return;
    }

    let active = true;
    setEntries(null);
    setErrorMessage(null);

    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (!active) return;
        const rows = [...logs].sort((a, b) => Number(b.authorizedAt) - Number(a.authorizedAt));
        setEntries(rows);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Activity could not be loaded.');
        setEntries([]);
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, publicClient]);

  return (
    <DashboardShell title="Activity">
      <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Your Agent Decisions</h2>
      <p className="mt-2 text-sm text-(--dark-300)">Every decision Veyra has made, on the record.</p>

      <div className="mt-8">
        {!isConnected ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Connect your wallet to see your activity.</p>
          </Card>
        ) : registryAddress === undefined ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Registry address isn&apos;t configured.</p>
          </Card>
        ) : entries === null ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Loading activity...</p>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <p className="text-sm text-(--dark-300)">{errorMessage ?? 'No activity yet.'}</p>
          </Card>
        ) : (
          <div className="divide-y divide-(--dark-50) overflow-hidden rounded-2xl border border-(--dark-50) bg-white">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.requestId;
              const narrative = getActionNarrative(resolveSecretLabel(entry.secretId));
              return (
                <div key={entry.requestId}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.requestId)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-(--dark-50)/30"
                  >
                    <span className="w-20 shrink-0 text-xs text-(--dark-300)">
                      {formatRelativeTime(entry.authorizedAt)}
                    </span>
                    <span className="w-32 shrink-0 truncate text-sm font-medium text-(--dark-400)">
                      {getAgentLabel(entry.agentAddress)}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs text-(--dark-300)">
                      {narrative.technical}
                    </span>
                    <span className="shrink-0 rounded-full bg-(--purple-500)/10 px-3 py-1 text-xs font-semibold text-(--purple-500)">
                      Allowed
                    </span>
                    <HugeiconsIcon
                      icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 text-(--dark-300)"
                    />
                  </button>
                  {isExpanded && (
                    <div className="grid gap-1 border-t border-(--dark-50) bg-(--creame) px-6 py-4 font-mono text-xs text-(--dark-300) sm:grid-cols-2">
                      <span>agent: {entry.agentAddress}</span>
                      <span>secret: {resolveSecretLabel(entry.secretId)}</span>
                      <span>request_id: {entry.requestId}</span>
                      <span>nullifier_hash: {entry.nullifierHash.toString().slice(0, 18)}...</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
