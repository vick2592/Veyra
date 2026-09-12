'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { LockKeyIcon, Pulse01Icon, Robot01Icon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';
import { fetchSecretsOf } from '@/lib/secrets';
import { fetchAgentAuthorizedLogs } from '@/lib/activityLog';
import { getRegisteredAgents } from '@/lib/agentDirectory';
import { registryAddress } from '@/lib/worldIdAuthorization';

type Stat = {
  href: string;
  icon: IconSvgElement;
  label: string;
  value: number | null;
};

function StatTile({ stat }: { stat: Stat }) {
  return (
    <Link href={stat.href}>
      <Card className="flex items-center gap-4 transition hover:border-(--purple-500)/40">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
          <HugeiconsIcon icon={stat.icon} size={18} strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-2xl font-bold text-(--dark-400)">{stat.value ?? '–'}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-(--dark-300)">{stat.label}</p>
        </div>
      </Card>
    </Link>
  );
}

/**
 * Real counts only, sourced from the same reads /secrets, /agents, and
 * /activity already use — not a duplicated or fabricated summary. Each tile
 * links to the tab that owns that data, so the hub is a jumping-off point
 * rather than a fourth place these numbers live.
 */
export function HubStats() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [secretsCount, setSecretsCount] = useState<number | null>(null);
  const [authorizationsCount, setAuthorizationsCount] = useState<number | null>(null);
  const agentsCount = address === undefined ? 1 : 1 + getRegisteredAgents(address).length;

  useEffect(() => {
    if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      return;
    }
    let active = true;

    fetchSecretsOf(publicClient, address, registryAddress)
      .then((secrets) => {
        if (active) {
          setSecretsCount(secrets.filter((secret) => secret.active).length);
        }
      })
      .catch(() => {
        if (active) setSecretsCount(0);
      });

    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (active) {
          setAuthorizationsCount(logs.length);
        }
      })
      .catch(() => {
        if (active) setAuthorizationsCount(0);
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, publicClient]);

  const stats: Stat[] = [
    { href: '/secrets', icon: LockKeyIcon, label: 'Active secrets', value: secretsCount },
    { href: '/agents', icon: Robot01Icon, label: 'Agents', value: agentsCount },
    { href: '/activity', icon: Pulse01Icon, label: 'Authorizations', value: authorizationsCount },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <StatTile key={stat.href} stat={stat} />
      ))}
    </div>
  );
}
