import type { Address, PublicClient } from 'viem';
import { registryAbi } from './worldIdAuthorization';

export type SecretSummary = {
  secretId: `0x${string}`;
  label: string;
  version: number;
  storedAt: bigint;
  active: boolean;
};

/**
 * Shared by the Secrets tab and the Agent Detail drawer's "Simulate request"
 * picker — both need the connected wallet's real on-chain secrets, not a
 * hardcoded identifier.
 */
export async function fetchSecretsOf(
  publicClient: PublicClient,
  owner: Address,
  registryAddress: `0x${string}`,
): Promise<SecretSummary[]> {
  const secretIds = await publicClient.readContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: 'secretIdsOf',
    args: [owner],
  });
  const rows = await Promise.all(
    secretIds.map(async (secretId) => {
      const secret = await publicClient.readContract({
        address: registryAddress,
        abi: registryAbi,
        functionName: 'getSecret',
        args: [owner, secretId],
      });
      return {
        secretId,
        label: secret.label,
        version: secret.version,
        storedAt: secret.storedAt,
        active: secret.active,
      };
    }),
  );
  return rows.sort((a, b) => Number(b.storedAt) - Number(a.storedAt));
}
