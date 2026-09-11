import { decodeAbiParameters, keccak256, encodePacked, toBytes } from 'viem';
import type { IDKitResult } from '@worldcoin/idkit';

/**
 * Same on-chain authorization mechanics /sandbox already proves out
 * (registry ABI, proof normalization, signal hashing) — duplicated here
 * rather than imported from sandbox, which stays untouched on purpose.
 */

export const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}` | undefined;

export const registryAbi = [
  {
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
  },
  {
    type: 'function',
    name: 'registerUser',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'encryptedUserId', type: 'bytes' },
      { name: 'leafIndex', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'storeSecret',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'secretId', type: 'bytes32' },
      { name: 'label', type: 'string' },
      { name: 'ciphertext', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSecret',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'secretId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getSecret',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'secretId', type: 'bytes32' },
    ],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'ciphertext', type: 'bytes' },
        { name: 'label', type: 'string' },
        { name: 'version', type: 'uint32' },
        { name: 'storedAt', type: 'uint64' },
        { name: 'active', type: 'bool' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'secretIdsOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bytes32[]' }],
  },
] as const;

export type OnChainProof = {
  root: string;
  nullifierHash: string;
  proof: string[];
};

export function getSecretId(secretIdentifier: string): `0x${string}` {
  return keccak256(toBytes(secretIdentifier));
}

/**
 * Returns the raw packed hex, not a pre-hashed digest — idkit hashes the
 * signal itself to match what the contract independently recomputes
 * (`keccak256(...) >> 8` in authorizeAgent). Pre-hashing here double-hashed
 * it and produced proofs that verified against the wrong signal. Matches
 * the fix landed in /sandbox on 2026-09-11 (commit ea401e5).
 */
export function getWorldIdSignal(
  userAddress: `0x${string}`,
  agentAddress: `0x${string}`,
  secretId: `0x${string}`,
): string {
  return encodePacked(
    ['address', 'address', 'bytes32'],
    [userAddress, agentAddress, secretId],
  );
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

const LEAF_INDEX_SPACE = 0x8000_0000; // 31-bit, non-hardened BIP32 range — mirrors backend's derive.ts

/**
 * `registerUser`/`storeSecret` need a leaf index and ciphertext, but only
 * the Ledger-holding server can produce real ones (see step-3 finding in
 * memory). The team's own `VEYRA_DEMO_MODE` fallback (apps/backend/src/
 * keyring.ts) already establishes that mock ciphertext is fine for this
 * build — execution reads straight from the backend's own env-configured
 * key regardless of what's stored on chain. So these are real on-chain
 * writes with placeholder payloads, not fabricated UI — the contract only
 * checks that the bytes are non-empty, never their content.
 */
export function deriveLeafIndex(address: `0x${string}`): number {
  const digest = keccak256(toBytes(address.toLowerCase()));
  return Number(BigInt(digest) % BigInt(LEAF_INDEX_SPACE));
}

export function getMockEncryptedUserId(address: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(['string', 'address'], ['veyra-demo-user', address]));
}

export function getMockCiphertext(secretName: string, ownerAddress: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(['string', 'string', 'address'], ['veyra-demo-secret', secretName, ownerAddress]));
}
