'use client';

import type { ReactNode } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { Wallet01Icon } from '@hugeicons/core-free-icons';
import { Sidebar } from './Sidebar';
import { TopBar, type Tier } from './TopBar';

type DashboardShellProps = {
  title: string;
  tier?: Tier;
  pendingCount?: number;
  children: ReactNode;
};

/**
 * Every dashboard page loses its meaning without a connected wallet — there's
 * no "whose agents/secrets/activity" without one. Centralized here so every
 * page gets the same reconnect placeholder for free, whether the wallet
 * disconnected via the sidebar icon or the top-bar chip.
 */
function ReconnectPrompt() {
  const { connect, connectors, status } = useConnect();
  const isConnecting = status === 'pending';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--dark-500) text-white">
        <HugeiconsIcon icon={Wallet01Icon} size={22} strokeWidth={1.5} />
      </span>
      <div>
        <p className="text-lg font-semibold text-(--dark-400)">Wallet disconnected</p>
        <p className="mt-1 text-sm text-(--dark-300)">Reconnect to see your agents, secrets, and activity.</p>
      </div>
      <button
        type="button"
        onClick={() => connectors[0] !== undefined && connect({ connector: connectors[0] })}
        disabled={isConnecting || connectors[0] === undefined}
        className="mt-2 inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isConnecting ? 'Connecting...' : 'Reconnect wallet'}
      </button>
    </div>
  );
}

export function DashboardShell({ title, tier, pendingCount, children }: DashboardShellProps) {
  const { isConnected } = useAccount();

  return (
    <div className="flex min-h-screen bg-(--creame)">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar title={title} tier={tier} pendingCount={pendingCount} />
        <main className="flex flex-1 flex-col px-6 py-6 sm:px-10">
          {isConnected ? children : <ReconnectPrompt />}
        </main>
      </div>
    </div>
  );
}
