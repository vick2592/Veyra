'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { FingerPrintCheckIcon, Wallet01Icon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { SecretProvisioningCard } from '@/components/dashboard/SecretProvisioningCard';
import { AgentExecutionCard } from '@/components/dashboard/AgentExecutionCard';
import { TrustChainVisualizer } from '@/components/dashboard/TrustChainVisualizer';
import { deriveLeafIndex } from '@/lib/worldIdAuthorization';

function IdentityCard({ address }: { address: `0x${string}` }) {
  const leafIndex = deriveLeafIndex(address);
  const bip32Path = `m/44'/60'/0'/0/${leafIndex}`;

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
          <p className="font-mono text-xs text-(--dark-300)">{bip32Path}</p>
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
  const [secretStored, setSecretStored] = useState(false);
  const [lastStoredLabel, setLastStoredLabel] = useState('openai-key');
  const [worldIdVerified, setWorldIdVerified] = useState(false);
  const [agentExecuted, setAgentExecuted] = useState(false);

  return (
    <DashboardShell title="Dashboard">
      <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Your hardware vault</h2>
      <p className="mt-2 text-sm text-(--dark-300)">
        Register secrets under your Ledger-derived key slot and test the agents that use them.
      </p>

      {address !== undefined && (
        <div className="mt-8">
          <IdentityCard address={address} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SecretProvisioningCard
          onStored={(label) => {
            setSecretStored(true);
            setLastStoredLabel(label);
          }}
        />
        <AgentExecutionCard
          secretLabel={lastStoredLabel}
          onAuthorized={() => setWorldIdVerified(true)}
          onExecuted={() => setAgentExecuted(true)}
        />
      </div>

      <div className="mt-6">
        <TrustChainVisualizer
          leafIndex={address === undefined ? 0 : deriveLeafIndex(address)}
          secretStored={secretStored}
          worldIdVerified={worldIdVerified}
          agentExecuted={agentExecuted}
        />
      </div>
    </DashboardShell>
  );
}
