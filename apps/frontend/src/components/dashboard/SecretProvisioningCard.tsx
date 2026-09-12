'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUpRight01Icon, LockKeyIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useStoreSecret } from '@/hooks/useStoreSecret';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const explorerTxBaseUrl = 'https://sepolia.basescan.org/tx/';

type EncryptStage = 'idle' | 'encrypting' | 'error';

/**
 * Encrypt via the backend's Ledger Key Ring route, then store the resulting
 * ciphertext on-chain. Two independent stage machines (encrypt, then store)
 * chained together so the status ladder can show which half is running:
 * "Encrypting via Ledger Key Ring" -> "Awaiting Wallet Approval" ->
 * "Confirmed on Base Sepolia".
 */
export function SecretProvisioningCard({ onStored }: { onStored: (label: string, txHash: `0x${string}`) => void }) {
  const { address } = useAccount();
  const [label, setLabel] = useState('openai-key');
  const [secretValue, setSecretValue] = useState('');
  const [encryptStage, setEncryptStage] = useState<EncryptStage>('idle');
  const [encryptError, setEncryptError] = useState<string | null>(null);
  const { state: storeState, txHash, errorMessage: storeError, storeSecret, reset: resetStore } = useStoreSecret();
  const notifiedTxHash = useRef<string | null>(null);

  const isBusy = encryptStage === 'encrypting' || storeState === 'preparing' || storeState === 'awaiting_signature' || storeState === 'pending';
  const errorMessage = encryptStage === 'error' ? encryptError : storeState === 'error' ? storeError : null;

  useEffect(() => {
    if (storeState === 'confirmed' && txHash !== null && notifiedTxHash.current !== txHash) {
      notifiedTxHash.current = txHash;
      onStored(label.trim(), txHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeState, txHash]);

  async function handleSubmit() {
    const trimmedLabel = label.trim();
    if (address === undefined || trimmedLabel.length === 0 || secretValue.length === 0 || isBusy) {
      return;
    }

    setEncryptError(null);
    resetStore();
    setEncryptStage('encrypting');
    try {
      const response = await fetch(`${backendUrl}/api/secrets/encrypt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userAddress: address, secretLabel: trimmedLabel, secretValue }),
      });
      const body = (await response.json().catch(() => null)) as { ciphertextHex?: string; error?: string } | null;
      if (!response.ok || body?.ciphertextHex === undefined) {
        throw new Error(body?.error ?? `Encryption failed with HTTP ${response.status}.`);
      }

      setEncryptStage('idle');
      const stored = await storeSecret(trimmedLabel, body.ciphertextHex as `0x${string}`);
      if (stored) {
        setSecretValue('');
      }
    } catch (error) {
      setEncryptStage('error');
      setEncryptError(error instanceof Error ? error.message : 'The secret could not be encrypted.');
    }
  }

  const statusLabel =
    encryptStage === 'encrypting'
      ? 'Encrypting via Ledger Key Ring...'
      : storeState === 'preparing'
        ? 'Preparing on-chain registration...'
        : storeState === 'awaiting_signature'
          ? 'Awaiting wallet approval...'
          : storeState === 'pending'
            ? 'Confirming on Base Sepolia...'
            : storeState === 'confirmed'
              ? 'Confirmed on Base Sepolia'
              : null;

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-semibold text-(--dark-400)">Add hardware-encrypted secret</p>
        <p className="mt-1 text-sm text-(--dark-300)">
          Encrypted under your derived Ledger Key Ring slot before it ever touches the chain.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="secret-label" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
            Secret label
          </label>
          <input
            id="secret-label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={isBusy}
            placeholder="openai-key"
            className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
          />
        </div>

        <div>
          <label htmlFor="secret-value" className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
            Secret value
          </label>
          <input
            id="secret-value"
            type="password"
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
            disabled={isBusy}
            placeholder="sk-live-..."
            autoComplete="off"
            className="mt-2 w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
          />
        </div>
      </div>

      <Button
        icon={LockKeyIcon}
        loading={isBusy}
        loadingLabel={statusLabel ?? 'Working...'}
        disabled={address === undefined || label.trim().length === 0 || secretValue.length === 0}
        onClick={() => void handleSubmit()}
      >
        Encrypt & Register Secret
      </Button>

      {errorMessage !== null && <p className="text-sm text-(--dark-400)">{errorMessage}</p>}

      {storeState === 'confirmed' && txHash !== null && (
        <a
          href={`${explorerTxBaseUrl}${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm font-semibold text-(--purple-500)"
        >
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={1.5} />
          Confirmed on Base Sepolia — view transaction
        </a>
      )}
    </Card>
  );
}
