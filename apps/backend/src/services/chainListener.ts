import {
  createPublicClient,
  defineChain,
  http,
  parseAbi,
  type PublicClient,
} from 'viem';
import type { AgentExecutorConfig } from '../execute-agent.js';
import { executeAgentWithSecret } from '../execute-agent.js';
import type { SecretKeyring } from '../keyring.js';
import type { PendingRequestStore } from '../queue/store.js';

const agentAuthorizedAbi = parseAbi([
  'event AgentAuthorized(address indexed user, address agent, string secretIdentifier, bytes32 requestId)',
]);

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
    secretIdentifier?: string;
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
  let unwatch: (() => void) | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

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
    if (requestId === undefined || requestId.length === 0) {
      processingLogs.delete(logId);
      logger.error('AgentAuthorized event did not contain a request ID');
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
        const result = await executeAgentWithSecret(
          pendingRequest.secretIdentifier,
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

  function scheduleRestart(): void {
    if (stopped || restartTimer !== undefined) {
      return;
    }

    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      startWatching();
    }, config.pollingIntervalMs);
  }

  function startWatching(): void {
    if (stopped || unwatch !== undefined) {
      return;
    }

    try {
      unwatch = getClient().watchEvent({
        address: config.registryAddress,
        event: agentAuthorizedAbi[0],
        fromBlock: config.startingBlock,
        onLogs: (logs) => {
          for (const log of logs) {
            void handleLog(log as AuthorizedLog);
          }
        },
        onError: (error) => {
          logger.error('Chain listener watch failed', error);
          unwatch?.();
          unwatch = undefined;
          scheduleRestart();
        },
      });
      logger.info('Chain listener started', { registryAddress: config.registryAddress });
    } catch (error) {
      logger.error('Chain listener startup failed', error);
      unwatch = undefined;
      scheduleRestart();
    }
  }

  function start(): void {
    if (!stopped) {
      return;
    }
    stopped = false;
    startWatching();
  }

  function stop(): void {
    stopped = true;
    if (restartTimer !== undefined) {
      clearTimeout(restartTimer);
      restartTimer = undefined;
    }
    unwatch?.();
    unwatch = undefined;
  }

  return {start, stop};
}