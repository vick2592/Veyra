'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, LockKeyIcon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/agents/StatusPill';
import { formatRelativeTime } from '@/lib/activityLog';
import { formatErrorMessage } from '@/lib/formatError';
import { fetchSecretsOf, type SecretSummary } from '@/lib/secrets';
import { registryAbi, registryAddress } from '@/lib/worldIdAuthorization';

// Opt-in overlay, not needed for the page's first paint.
const AddSecretModal = dynamic(() =>
  import('@/components/secrets/AddSecretModal').then((mod) => mod.AddSecretModal),
);

export default function SecretsPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshSecrets() {
    if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setSecrets(null);
      return;
    }
    try {
      setSecrets(await fetchSecretsOf(publicClient, address, registryAddress));
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'Secrets could not be loaded.'));
      setSecrets([]);
    }
  }

  useEffect(() => {
    void refreshSecrets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, publicClient]);

  async function handleRevoke(secretId: `0x${string}`) {
    if (publicClient === undefined || registryAddress === undefined) {
      return;
    }
    setRevokingId(secretId);
    setErrorMessage(null);
    try {
      const hash = await writeContractAsync({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'revokeSecret',
        args: [secretId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshSecrets();
    } catch (error) {
      setErrorMessage(formatErrorMessage(error, 'The secret could not be revoked.'));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <DashboardShell title="Secrets">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Manage Your Secrets</h2>
          <p className="mt-2 text-sm text-(--dark-300)">Scoped keys your agents can request — never held directly.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          disabled={!isConnected}
          title={!isConnected ? 'Connect your wallet first' : undefined}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6b4fe6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
          Add secret
        </button>
      </div>

      <div className="mt-8">
        {!isConnected ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Connect your wallet to see your secrets.</p>
          </Card>
        ) : secrets === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Card key={index} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-(--dark-50)" />
                  <div className="min-w-0 flex-1">
                    <span className="block h-4 w-2/3 animate-pulse rounded-full bg-(--dark-50)" />
                    <span className="mt-2 block h-3 w-1/3 animate-pulse rounded-full bg-(--dark-50)" />
                  </div>
                </div>
                <div className="border-t border-(--dark-50) pt-4">
                  <span className="block h-3 w-1/2 animate-pulse rounded-full bg-(--dark-50)" />
                </div>
              </Card>
            ))}
          </div>
        ) : secrets.length === 0 ? (
          <Card>
            <p className="text-sm text-(--dark-300)">{errorMessage ?? 'No secrets yet. Add one to get started.'}</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {secrets.map((secret) => (
              <Card key={secret.secretId} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
                    <HugeiconsIcon icon={LockKeyIcon} size={18} strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-(--dark-400)">{secret.label}</p>
                      <StatusPill status={secret.active ? 'active' : 'revoked'} />
                    </div>
                    <p className="text-xs text-(--dark-300)">
                      v{secret.version} · {formatRelativeTime(secret.storedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-(--dark-50) pt-4">
                  <p className="font-mono text-xs text-(--dark-300)">
                    {secret.secretId.slice(0, 10)}...{secret.secretId.slice(-6)}
                  </p>
                  {secret.active && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(secret.secretId)}
                      disabled={revokingId === secret.secretId}
                      className="shrink-0 rounded-full border border-(--dark-50) px-4 py-2 text-xs font-semibold text-(--dark-300) transition hover:bg-(--dark-50) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {revokingId === secret.secretId ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isAddOpen && (
        <AddSecretModal open={isAddOpen} onClose={() => setIsAddOpen(false)} onCreated={() => void refreshSecrets()} />
      )}
    </DashboardShell>
  );
}
