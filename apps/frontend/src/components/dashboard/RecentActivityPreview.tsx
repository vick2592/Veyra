'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';
import { registryAddress } from '@/lib/worldIdAuthorization';
import { fetchAgentAuthorizedLogs, formatRelativeTime, resolveSecretLabel, type ActivityEntry } from '@/lib/activityLog';

const PREVIEW_COUNT = 3;

/**
 * Same real AgentAuthorized log /activity reads in full, trimmed to the
 * most recent few so the hub has a pulse instead of a static tile grid.
 */
export function RecentActivityPreview() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setEntries(null);
      return;
    }
    let active = true;
    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (!active) return;
        const rows = [...logs].sort((a, b) => Number(b.authorizedAt) - Number(a.authorizedAt));
        setEntries(rows.slice(0, PREVIEW_COUNT));
      })
      .catch(() => {
        if (active) setEntries([]);
      });
    return () => {
      active = false;
    };
  }, [address, isConnected, publicClient]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-(--dark-400)">Recent activity</p>
        <Link href="/activity" className="flex items-center gap-1 text-xs font-semibold text-(--purple-500)">
          View all
          <HugeiconsIcon icon={ArrowRight02Icon} size={12} strokeWidth={2} />
        </Link>
      </div>

      {entries === null ? (
        <p className="text-sm text-(--dark-300)">Loading activity...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-(--dark-300)">No activity yet — authorized requests will show up here.</p>
      ) : (
        <div className="flex flex-col divide-y divide-(--dark-50)">
          {entries.map((entry) => {
            const narrative = getActionNarrative(resolveSecretLabel(entry.secretId));
            return (
              <div key={entry.requestId} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <span className="w-16 shrink-0 text-xs text-(--dark-300)">
                  {formatRelativeTime(entry.authorizedAt)}
                </span>
                <span className="w-28 shrink-0 truncate text-sm font-medium text-(--dark-400)">
                  {getAgentLabel(entry.agentAddress)}
                </span>
                <span className="flex-1 truncate text-sm text-(--dark-300)">{narrative.headline}</span>
                <span className="shrink-0 rounded-full bg-(--purple-500)/10 px-3 py-1 text-xs font-semibold text-(--purple-500)">
                  Allowed
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
