'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import {
  deriveLeafIndex,
  getMockEncryptedUserId,
  getSecretId,
  registryAbi,
  registryAddress,
} from '@/lib/worldIdAuthorization';

export type StoreSecretState = 'idle' | 'preparing' | 'awaiting_signature' | 'pending' | 'confirmed' | 'error';

/**
 * Wraps the on-chain `storeSecret(bytes32 secretId, string label, bytes ciphertext)`
 * write. `secretId` reuses the same `getSecretId(label)` helper every other
 * secret-writing surface (useCreateSecret, /secrets, /sandbox) already uses —
 * the contract's storage is `user => secretId => Secret`, so the id only needs
 * to distinguish a user's own labels, not embed their address.
 *
 * storeSecret requires `onlyRegistered`, so an unregistered wallet is
 * registered first (same mock-payload registerUser call useCreateSecret.ts
 * already performs) before the real write.
 */
export function useStoreSecret() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<StoreSecretState>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function storeSecret(label: string, ciphertextHex: `0x${string}`): Promise<boolean> {
    const trimmedLabel = label.trim();
    if (
      address === undefined ||
      publicClient === undefined ||
      registryAddress === undefined ||
      trimmedLabel.length === 0
    ) {
      return false;
    }

    setErrorMessage(null);
    setTxHash(null);

    try {
      setState('preparing');
      const isRegistered = await publicClient.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'isRegistered',
        args: [address],
      });

      if (!isRegistered) {
        const registerHash = await writeContractAsync({
          address: registryAddress,
          abi: registryAbi,
          functionName: 'registerUser',
          args: [getMockEncryptedUserId(address), deriveLeafIndex(address)],
        });
        await publicClient.waitForTransactionReceipt({ hash: registerHash });
      }

      setState('awaiting_signature');
      const hash = await writeContractAsync({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'storeSecret',
        args: [getSecretId(trimmedLabel), trimmedLabel, ciphertextHex],
      });
      setTxHash(hash);

      setState('pending');
      await publicClient.waitForTransactionReceipt({ hash });

      setState('confirmed');
      return true;
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'The secret could not be stored on-chain.');
      return false;
    }
  }

  function reset() {
    setState('idle');
    setTxHash(null);
    setErrorMessage(null);
  }

  return { state, txHash, errorMessage, storeSecret, reset };
}
