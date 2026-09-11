import { decodeAbiParameters, keccak256, encodePacked, toBytes } from 'viem';
import type { IDKitResult } from '@worldcoin/idkit';

/**
 * Same on-chain authorization mechanics /sandbox already proves out
 * (registry ABI, proof normalization, signal hashing) — duplicated here
 * rather than imported from sandbox, which stays untouched on purpose.
 */

export const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;

export const registryAbi = [{
  type: 'function',
  name: 'authorizeAgent',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'agentAddress', type: 'address' },
    { name: 'secretId', type: 'bytes32' },
    { name: 'root', type: 'uint256' },
    { name: 'nullifierHash', type: 'uint256' },
    { name: 'proof', type: 'uint256[8]' },
    { name: 'requestId', type: 'bytes32' },
  ],
  outputs: [],
}] as const;

export type OnChainProof = {
  root: string;
  nullifierHash: string;
  proof: string[];
};

export function getSecretId(secretIdentifier: string): `0x${string}` {
  return keccak256(toBytes(secretIdentifier));
}

export function getWorldIdSignal(
  userAddress: `0x${string}`,
  agentAddress: `0x${string}`,
  secretId: `0x${string}`,
): string {
  const digest = keccak256(encodePacked(
    ['address', 'address', 'bytes32'],
    [userAddress, agentAddress, secretId],
  ));
  return (BigInt(digest) >> BigInt(8)).toString();
}

export function getOnChainProof(result: IDKitResult): OnChainProof {
  try {
    const payload = result as IDKitResult & {
      root?: string;
      nullifier_hash?: string;
      proof?: string[] | string;
    };
    const response = result.responses[0] as {
      root?: string;
      merkle_root?: string;
      nullifier_hash?: string;
      nullifier?: string;
      proof?: string[] | string;
      session_nullifier?: string[];
    } | undefined;
    const candidate = payload.root !== undefined || payload.nullifier_hash !== undefined || payload.proof !== undefined
      ? payload
      : response;
    const rawProof = candidate?.proof;
    const proof = Array.isArray(rawProof)
      ? rawProof
      : typeof rawProof === 'string' && rawProof.trim().startsWith('[')
        ? JSON.parse(rawProof) as unknown
        : typeof rawProof === 'string'
          ? decodeAbiParameters([{ type: 'uint256[8]' }], rawProof as `0x${string}`)[0]
          : undefined;
    if (!Array.isArray(proof) || proof.length !== 8 || proof.some((value) => typeof value !== 'string' && typeof value !== 'bigint')) {
      throw new Error(`World ID proof must contain exactly 8 values; received ${Array.isArray(proof) ? proof.length : typeof proof}.`);
    }

    const root = candidate?.root ?? (candidate === response ? response?.merkle_root : undefined) ?? (proof[4] as string | bigint);
    const nullifierHash = candidate?.nullifier_hash ?? (candidate === response ? response?.nullifier : undefined) ?? (candidate === response ? response?.session_nullifier?.[0] : undefined);
    if (root === undefined || nullifierHash === undefined) {
      throw new Error('World ID returned an incomplete on-chain proof.');
    }

    return {
      root: String(root),
      nullifierHash: String(nullifierHash),
      proof: proof.map((value) => String(value)),
    };
  } catch (error) {
    console.error('[World ID] proof normalization failed', {
      error,
      result,
      response: result.responses?.[0],
    });
    throw error instanceof Error ? error : new Error('World ID proof normalization failed.');
  }
}

export function getSimulatorUrl(connectorURI: string): string {
  return `https://simulator.worldcoin.org?connect_url=${encodeURIComponent(connectorURI)}`;
}
