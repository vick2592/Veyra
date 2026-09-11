'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import {
  deriveLeafIndex,
  getMockCiphertext,
  getMockEncryptedUserId,
  getSecretId,
  registryAbi,
  registryAddress,
} from '@/lib/worldIdAuthorization';

export type CreateSecretState = 'idle' | 'registering' | 'storing' | 'done' | 'error';

/**
 * Shared by Setup's "Create secret" step and the Secrets tab's "Add secret"
 * modal — same real on-chain sequence either place: register the wallet if
 * it isn't yet (real tx, placeholder payload — see worldIdAuthorization.ts),
 * then store the secret (real tx, placeholder ciphertext).
 */
export function useCreateSecret() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [state, setState] = useState<CreateSecretState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function createSecret(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || address === undefined || publicClient === undefined || registryAddress === undefined) {
      return false;
    }
    setErrorMessage(null);
    try {
      const isRegistered = await publicClient.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'isRegistered',
        args: [address],
      });

      if (!isRegistered) {
        setState('registering');
        const registerHash = await writeContractAsync({
          address: registryAddress,
          abi: registryAbi,
          functionName: 'registerUser',
          args: [getMockEncryptedUserId(address), deriveLeafIndex(address)],
        });
        await publicClient.waitForTransactionReceipt({ hash: registerHash });
      }

      setState('storing');
      const storeHash = await writeContractAsync({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'storeSecret',
        args: [getSecretId(trimmed), trimmed, getMockCiphertext(trimmed, address)],
      });
      await publicClient.waitForTransactionReceipt({ hash: storeHash });
      setState('done');
      return true;
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'The secret could not be created.');
      return false;
    }
  }

  function reset() {
    setState('idle');
    setErrorMessage(null);
  }

  return { state, errorMessage, createSecret, reset };
}
