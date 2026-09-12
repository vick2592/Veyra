'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowRight02Icon, FingerPrintCheckIcon, Wallet01Icon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { HubStats } from '@/components/dashboard/HubStats';
import { PendingRequestBanner } from '@/components/dashboard/PendingRequestBanner';
import { RecentActivityPreview } from '@/components/dashboard/RecentActivityPreview';
import { TrustChainVisualizer } from '@/components/dashboard/TrustChainVisualizer';
import { deriveLeafIndex } from '@/lib/worldIdAuthorization';

// Opt-in overlay, same modal /secrets uses — adding a secret should behave
// identically no matter which tab it's launched from.
const AddSecretModal = dynamic(() =>
  import('@/components/secrets/AddSecretModal').then((mod) => mod.AddSecretModal),
);

function IdentityCard({ address }: { address: `0x${string}` }) {
  const leafIndex = deriveLeafIndex(address);

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--dark-500) text-white">
          <HugeiconsIcon icon={Wallet01Icon} size={20} strokeWidth={1.5} />
        </span>
        <div>
          <p className="font-mono text-sm font-semibold text-(--dark-400)">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <p className="text-xs text-(--dark-300)">Base Sepolia</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--dark-50) bg-(--creame) px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-(--dark-300)">Hardware key slot</p>
          <p className="font-mono text-sm text-(--dark-400)">veyra-user-{leafIndex}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#15803D]">
          <HugeiconsIcon icon={FingerPrintCheckIcon} size={12} strokeWidth={2} />
          Ledger Hardware Protected
        </span>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { address } = useAccount();
  const [isAddSecretOpen, setIsAddSecretOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <DashboardShell title="Dashboard">
      <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Your Veyra overview</h2>
      <p className="mt-2 text-sm text-(--dark-300)">Identity, secrets, and agents — all in one place.</p>

      <div className="mt-6">
        <PendingRequestBanner />
      </div>

      {address !== undefined && (
        <div className="mt-8">
          <IdentityCard address={address} />
        </div>
      )}

      <div className="mt-6">
        <HubStats key={refreshKey} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RecentActivityPreview key={refreshKey} />

        <Card className="flex flex-col gap-4">
          <p className="text-lg font-semibold text-(--dark-400)">Quick actions</p>
          <button
            type="button"
            onClick={() => setIsAddSecretOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            Add secret
          </button>
          <Link
            href="/agents"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-(--dark-50) px-6 py-3 text-sm font-semibold text-(--dark-400) transition hover:bg-(--dark-50)/40"
          >
            View agents
            <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.5} />
          </Link>
        </Card>
      </div>

      <div className="mt-6">
        <TrustChainVisualizer />
      </div>

      {isAddSecretOpen && (
        <AddSecretModal
          open={isAddSecretOpen}
          onClose={() => setIsAddSecretOpen(false)}
          onCreated={() => setRefreshKey((key) => key + 1)}
        />
      )}
    </DashboardShell>
  );
}
