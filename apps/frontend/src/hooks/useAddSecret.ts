'use client';

import { useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useStoreSecret } from '@/hooks/useStoreSecret';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export type AddSecretStage = 'idle' | 'encrypting' | 'preparing' | 'awaiting_signature' | 'pending' | 'confirmed' | 'error';

type EncryptResponse = { ciphertextHex?: string; error?: string };

/**
 * Restores the hardware-encryption leg that used to sit in front of
 * `storeSecret`: the plaintext never leaves this hook for anywhere but the
 * backend's `/api/secrets/encrypt` (the Ledger Key Ring custodian). Only the
 * returned ciphertext reaches `useStoreSecret`'s on-chain write.
 */
export function useAddSecret() {
  const { address } = useAccount();
  const store = useStoreSecret();
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState<string | null>(null);
  // Synchronous guard — the busy-derived button disable only lands after
  // the first await, leaving a window for a fast double click to fire this
  // twice concurrently before React re-renders the disabled button.
  const isSubmittingRef = useRef(false);

  async function addSecret(label: string, plaintextValue: string): Promise<boolean> {
    const trimmedLabel = label.trim();
    const trimmedValue = plaintextValue.trim();
    if (address === undefined || trimmedLabel.length === 0 || trimmedValue.length === 0 || isSubmittingRef.current) {
      return false;
    }

    isSubmittingRef.current = true;
    setEncryptError(null);
    setIsEncrypting(true);
    let ciphertextHex: `0x${string}`;
    try {
      const response = await fetch(`${backendUrl}/api/secrets/encrypt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userAddress: address, secretLabel: trimmedLabel, secretValue: trimmedValue }),
      });
      const body = (await response.json().catch(() => null)) as EncryptResponse | null;
      if (!response.ok || body?.ciphertextHex === undefined) {
        throw new Error(body?.error ?? 'Hardware encryption failed.');
      }
      ciphertextHex = body.ciphertextHex as `0x${string}`;
    } catch (error) {
      // A refused fetch (backend not running) throws a bare TypeError with no
      // useful message — every other failure (400/502 from the route itself)
      // is a real Error with an .message worth showing as-is.
      setEncryptError(
        error instanceof TypeError
          ? 'Backend connection failed. Ensure the Veyra hardware node is running on port 3001.'
          : error instanceof Error
            ? error.message
            : 'Hardware encryption failed.',
      );
      setIsEncrypting(false);
      isSubmittingRef.current = false;
      return false;
    }
    setIsEncrypting(false);
    const stored = await store.storeSecret(trimmedLabel, ciphertextHex);
    isSubmittingRef.current = false;
    return stored;
  }

  function reset() {
    setEncryptError(null);
    setIsEncrypting(false);
    isSubmittingRef.current = false;
    store.reset();
  }

  const stage: AddSecretStage = isEncrypting
    ? 'encrypting'
    : encryptError !== null
      ? 'error'
      : store.state;

  return {
    stage,
    errorMessage: encryptError ?? store.errorMessage,
    addSecret,
    reset,
  };
}
