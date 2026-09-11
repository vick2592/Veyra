import type { usePublicClient } from 'wagmi';
import { getSecretId } from './worldIdAuthorization';

/**
 * Every field here comes from the real `AgentAuthorized` event VeyraRegistry
 * emits — no backend, no fabricated history. There is no on-chain record of
 * a denial (authorizeAgent only emits on success), so this can only ever
 * surface "Allowed" entries — that's the honest shape of the data, not a
 * missing feature. Shared by /activity and the Agent Detail drawer.
 */
export const agentAuthorizedEvent = {
  type: 'event',
  name: 'AgentAuthorized',
  inputs: [
    { name: 'user', type: 'address', indexed: true },
    { name: 'agent', type: 'address', indexed: true },
    { name: 'secretId', type: 'bytes32', indexed: true },
    { name: 'nullifierHash', type: 'uint256', indexed: false },
    { name: 'requestId', type: 'bytes32', indexed: false },
    { name: 'authorizedAt', type: 'uint64', indexed: false },
  ],
} as const;

const BLOCK_RANGE_LIMIT = BigInt(9_000); // Base Sepolia's public RPC caps eth_getLogs at 10,000 blocks per call
const MAX_LOOKBACK_BLOCKS = BigInt(100_000); // ~2.3 days at Base's ~2s block time — comfortably past this contract's real deploy age

export type ActivityEntry = {
  agentAddress: string;
  secretId: string;
  nullifierHash: bigint;
  requestId: string;
  authorizedAt: bigint;
};

/**
 * Base Sepolia's public RPC rejects a single eth_getLogs call spanning more
 * than 10,000 blocks, and "earliest" spans the chain's entire history — so
 * this walks backward from the latest block in windows under that limit.
 */
export async function fetchAgentAuthorizedLogs(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  userAddress: `0x${string}`,
  contractAddress: `0x${string}`,
): Promise<ActivityEntry[]> {
  const latestBlock = await client.getBlockNumber();
  const earliestBlock = latestBlock > MAX_LOOKBACK_BLOCKS ? latestBlock - MAX_LOOKBACK_BLOCKS : BigInt(0);

  const entries: ActivityEntry[] = [];
  let toBlock = latestBlock;
  while (toBlock >= earliestBlock) {
    const fromBlock = toBlock - BLOCK_RANGE_LIMIT + BigInt(1) > earliestBlock
      ? toBlock - BLOCK_RANGE_LIMIT + BigInt(1)
      : earliestBlock;
    const chunk = await client.getLogs({
      address: contractAddress,
      event: agentAuthorizedEvent,
      args: { user: userAddress },
      fromBlock,
      toBlock,
    });
    for (const log of chunk) {
      entries.push({
        agentAddress: log.args.agent as string,
        secretId: log.args.secretId as string,
        nullifierHash: log.args.nullifierHash as bigint,
        requestId: log.args.requestId as string,
        authorizedAt: log.args.authorizedAt as bigint,
      });
    }
    if (fromBlock === earliestBlock) {
      break;
    }
    toBlock = fromBlock - BigInt(1);
  }
  return entries;
}

const demoSecretId = getSecretId('openai-key');

export function resolveSecretLabel(secretId: string): string {
  return secretId.toLowerCase() === demoSecretId.toLowerCase()
    ? 'openai-key'
    : `${secretId.slice(0, 10)}...${secretId.slice(-6)}`;
}

export function formatRelativeTime(unixSeconds: bigint): string {
  const deltaMs = Date.now() - Number(unixSeconds) * 1_000;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
