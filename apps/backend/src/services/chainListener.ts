import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type PublicClient,
} from 'viem';
import type { AgentExecutorConfig } from '../execute-agent.js';
import { executeAgentWithUserSecret } from '../execute-agent.js';
import type { SecretKeyring } from '../keyring.js';
import type { PendingRequestStore } from '../queue/store.js';

const agentAuthorizedAbi = parseAbi([
  'event AgentAuthorized(address indexed user, address indexed agent, bytes32 indexed secretId, uint256 nullifierHash, bytes32 requestId, uint64 authorizedAt)',
]);

/** Mirrors VeyraRegistry.sol's getSecret exactly (same shape as the frontend's registryAbi). */
const registryReadAbi = [
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
] as const;

export type ChainListenerConfig = {
  rpcUrl: string;
  chainId: number;
  registryAddress: `0x${string}`;
  startingBlock?: bigint;
  confirmations: number;
  pollingIntervalMs: number;
};

export type ChainListenerDependencies = {
  keyring: SecretKeyring;
  agentConfig: AgentExecutorConfig;
  requestStore: PendingRequestStore;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, 'error' | 'info'>;
  client?: PublicClient;
};

export type ChainListener = {
  start(): void;
  stop(): void;
};

type AuthorizedLog = {
  args: {
    user?: `0x${string}`;
    // secretIdentifier is no longer on the event — it is a bytes32 secretId hash now.
    // The plaintext identifier comes from the pending request store instead.
    secretId?: `0x${string}`;
    requestId?: string;
  };
  transactionHash: `0x${string}`;
  logIndex: number;
};

export function createChainListener(
  config: ChainListenerConfig,
  dependencies: ChainListenerDependencies,
): ChainListener {
  const logger = dependencies.logger ?? console;
  const seenLogs = new Set<string>();
  const processingLogs = new Set<string>();
  let client: PublicClient | undefined = dependencies.client;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let polling = false;
  let lastPolledBlock: bigint | undefined;
  let stopped = true;

  /** How many blocks back to scan on each poll. Tight range avoids heavy RPC load. */
  const BLOCK_SCAN_WINDOW = 10n;

  function getClient(): PublicClient {
    if (client !== undefined) {
      return client;
    }

    const chain = defineChain({
      id: config.chainId,
      name: `Veyra chain ${config.chainId}`,
      nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    client = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
      pollingInterval: config.pollingIntervalMs,
    });
    return client;
  }

  function claimLog(log: AuthorizedLog): string | undefined {
    const logId = `${log.transactionHash}:${log.logIndex}`;
    if (seenLogs.has(logId) || processingLogs.has(logId)) {
      return undefined;
    }

    processingLogs.add(logId);
    return logId;
  }

  function markLogProcessed(logId: string): void {
    processingLogs.delete(logId);
    seenLogs.add(logId);
    if (seenLogs.size > 1_000) {
      const oldest = seenLogs.values().next().value;
      if (oldest !== undefined) {
        seenLogs.delete(oldest);
      }
    }
  }

  async function handleLog(log: AuthorizedLog): Promise<void> {
    const logId = claimLog(log);
    if (logId === undefined) {
      return;
    }

    const requestId = log.args.requestId;
    const user = log.args.user;
    const secretId = log.args.secretId;
    if (requestId === undefined || requestId.length === 0) {
      processingLogs.delete(logId);
      logger.error('AgentAuthorized event did not contain a request ID');
      return;
    }
    if (user === undefined || secretId === undefined) {
      processingLogs.delete(logId);
      logger.error('AgentAuthorized event did not contain a user or secret ID', { requestId });
      return;
    }

    try {
      await getClient().waitForTransactionReceipt({
        hash: log.transactionHash,
        confirmations: config.confirmations,
      });
      const pendingRequest = dependencies.requestStore.claimForExecution(requestId);
      if (pendingRequest === undefined) {
        markLogProcessed(logId);
        logger.info('Ignored AgentAuthorized event without a pending request', {
          requestId,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        });
        return;
      }

      try {
        const secret = await getClient().readContract({
          address: config.registryAddress,
          abi: registryReadAbi,
          functionName: 'getSecret',
          args: [user, secretId],
        });
        if (!secret.active || secret.ciphertext.length === 0 || secret.ciphertext === '0x') {
          throw new Error('No active hardware-encrypted secret is stored for this authorization');
        }

        const result = await executeAgentWithUserSecret(
          user,
          secret.ciphertext,
          dependencies.keyring,
          dependencies.agentConfig,
          dependencies.fetchImpl,
        );
        dependencies.requestStore.transition(requestId, 'completed', {result});
      } catch (error) {
        dependencies.requestStore.transition(requestId, 'failed', {
          errorCode: 'execution_failed',
          errorMessage: error instanceof Error ? error.message : 'Agent execution failed',
        });
        throw error;
      }
      markLogProcessed(logId);
      logger.info('Processed AgentAuthorized event', {
        requestId,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      });
    } catch (error) {
      processingLogs.delete(logId);
      logger.error('AgentAuthorized processing failed', error);
    }
  }

  /**
   * Poll for new logs using getLogs over a tight block range.
   * This avoids stateful eth_newFilter/eth_getFilterChanges which break
   * across load-balanced public RPC nodes.
   */
  async function pollForLogs(): Promise<void> {
    if (polling || stopped) {
      return;
    }
    polling = true;

    try {
      const c = getClient();
      const latestBlock = await c.getBlockNumber();

      // Determine fromBlock: on first poll, use config.startingBlock or latest - window.
      // On subsequent polls, start from lastPolledBlock (no re-scan beyond window).
      let fromBlock: bigint;
      if (lastPolledBlock === undefined) {
        if (config.startingBlock === undefined) {
          fromBlock = latestBlock > BLOCK_SCAN_WINDOW ? latestBlock - BLOCK_SCAN_WINDOW : 0n;
          logger.info('LISTENER_STARTING_BLOCK not set — starting dynamically from latest - 10', {
            latestBlock: latestBlock.toString(),
            fromBlock: fromBlock.toString(),
          });
        } else {
          fromBlock = config.startingBlock;
        }
        if (fromBlock < 0n) {
          fromBlock = 0n;
        }
      } else {
        fromBlock = lastPolledBlock;
        // Don't scan more than BLOCK_SCAN_WINDOW behind latest to stay bounded
        const minFrom = latestBlock - BLOCK_SCAN_WINDOW;
        if (fromBlock < minFrom) {
          fromBlock = minFrom;
        }
      }

      if (fromBlock > latestBlock) {
        // No new blocks yet
        return;
      }

      const logs = await c.getLogs({
        address: config.registryAddress,
        event: agentAuthorizedAbi[0],
        fromBlock,
        toBlock: latestBlock,
      });

      // Advance our cursor to the latest block we've scanned
      lastPolledBlock = latestBlock + 1n;

      for (const log of logs) {
        void handleLog(log as unknown as AuthorizedLog);
      }
    } catch (error) {
      logger.error('Chain listener poll failed', error);
    } finally {
      polling = false;
    }
  }

  function start(): void {
    if (!stopped) {
      return;
    }
    stopped = false;
    lastPolledBlock = undefined;
    pollTimer = setInterval(() => {
      void pollForLogs();
    }, config.pollingIntervalMs);
    // Also do an immediate first poll
    void pollForLogs();
    logger.info('Chain listener started (block-poll mode)', {
      registryAddress: config.registryAddress,
      pollingIntervalMs: config.pollingIntervalMs,
      blockScanWindow: BLOCK_SCAN_WINDOW.toString(),
    });
  }

  function stop(): void {
    stopped = true;
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  return {start, stop};
}