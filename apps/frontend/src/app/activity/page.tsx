'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { useAccount, usePublicClient } from 'wagmi';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';
import { getSecretId, registryAddress } from '@/lib/worldIdAuthorization';

/**
 * Every field here comes from the real `AgentAuthorized` event VeyraRegistry
 * emits — no backend, no fabricated history. There is no on-chain record of
 * a denial (authorizeAgent only emits on success), so this can only ever
 * show "Allowed" rows — that's the honest shape of the data, not a missing
 * feature.
 */
const agentAuthorizedEvent = {
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

type ActivityEntry = {
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
async function fetchAgentAuthorizedLogs(
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

function resolveSecretLabel(secretId: string): string {
  return secretId.toLowerCase() === demoSecretId.toLowerCase()
    ? 'openai-key'
    : `${secretId.slice(0, 10)}...${secretId.slice(-6)}`;
}

function formatRelativeTime(unixSeconds: bigint): string {
  const deltaMs = Date.now() - Number(unixSeconds) * 1_000;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ActivityPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setEntries(null);
      return;
    }

    let active = true;
    setEntries(null);
    setErrorMessage(null);

    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (!active) return;
        const rows = [...logs].sort((a, b) => Number(b.authorizedAt) - Number(a.authorizedAt));
        setEntries(rows);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Activity could not be loaded.');
        setEntries([]);
      });

    return () => {
      active = false;
    };
  }, [address, isConnected, publicClient]);

  return (
    <DashboardShell title="Activity">
      <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Your Agent Decisions</h2>
      <p className="mt-2 text-sm text-(--dark-300)">Every decision Veyra has made, on the record.</p>

      <div className="mt-8">
        {!isConnected ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Connect your wallet to see your activity.</p>
          </Card>
        ) : registryAddress === undefined ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Registry address isn&apos;t configured.</p>
          </Card>
        ) : entries === null ? (
          <Card>
            <p className="text-sm text-(--dark-300)">Loading activity...</p>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <p className="text-sm text-(--dark-300)">{errorMessage ?? 'No activity yet.'}</p>
          </Card>
        ) : (
          <div className="divide-y divide-(--dark-50) overflow-hidden rounded-2xl border border-(--dark-50) bg-white">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.requestId;
              const narrative = getActionNarrative(resolveSecretLabel(entry.secretId));
              return (
                <div key={entry.requestId}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.requestId)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-(--dark-50)/30"
                  >
                    <span className="w-20 shrink-0 text-xs text-(--dark-300)">
                      {formatRelativeTime(entry.authorizedAt)}
                    </span>
                    <span className="w-32 shrink-0 truncate text-sm font-medium text-(--dark-400)">
                      {getAgentLabel(entry.agentAddress)}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs text-(--dark-300)">
                      {narrative.technical}
                    </span>
                    <span className="shrink-0 rounded-full bg-(--purple-500)/10 px-3 py-1 text-xs font-semibold text-(--purple-500)">
                      Allowed
                    </span>
                    <HugeiconsIcon
                      icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 text-(--dark-300)"
                    />
                  </button>
                  {isExpanded && (
                    <div className="grid gap-1 border-t border-(--dark-50) bg-(--creame) px-6 py-4 font-mono text-xs text-(--dark-300) sm:grid-cols-2">
                      <span>agent: {entry.agentAddress}</span>
                      <span>secret: {resolveSecretLabel(entry.secretId)}</span>
                      <span>request_id: {entry.requestId}</span>
                      <span>nullifier_hash: {entry.nullifierHash.toString().slice(0, 18)}...</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
