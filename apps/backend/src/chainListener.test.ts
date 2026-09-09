import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { createPendingRequestStore } from './queue/store.js';
import { createChainListener } from './services/chainListener.js';

type WatchOptions = {
  onLogs: (logs: unknown[]) => void;
  onError: (error: unknown) => void;
  address: `0x${string}`;
};

const registryAddress = '0x00000000000000000000000000000000000000aa' as const;
const transactionHash = '0x00000000000000000000000000000000000000000000000000000000000000bb' as const;

function createHarness() {
  let watchOptions: WatchOptions | undefined;
  const unwatch = vi.fn();
  const watchEvent = vi.fn((options: WatchOptions) => {
    watchOptions = options;
    return unwatch;
  });
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({});
  const keyring = {decryptSecret: vi.fn().mockResolvedValue('secret-key')};
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', {status: 200}));
  const logger = {error: vi.fn(), info: vi.fn()};
  const requestStore = createPendingRequestStore();
  requestStore.create({
    requestId: 'request-1',
    idempotencyKey: 'key-1',
    paymentReference: 'payment-1',
    agentAddress: '0xagent',
    secretIdentifier: 'ledger-key-42',
    expiresAt: '2999-01-01T00:00:00.000Z',
  });
  const client = {
    watchEvent,
    waitForTransactionReceipt,
  } as unknown as PublicClient;
  const listener = createChainListener({
    rpcUrl: 'https://rpc.test',
    chainId: 84532,
    registryAddress,
    confirmations: 2,
    pollingIntervalMs: 10,
  }, {
    keyring,
    agentConfig: {agentApiUrl: 'https://provider.test'},
    requestStore,
    fetchImpl,
    logger,
    client,
  });

  return {
    listener,
    watchEvent,
    waitForTransactionReceipt,
    keyring,
    fetchImpl,
    requestStore,
    logger,
    unwatch,
    getWatchOptions: () => watchOptions,
  };
}

function authorizedLog(secretIdentifier = 'ledger-key-42') {
  return {
    args: {secretIdentifier, requestId: 'request-1'},
    transactionHash,
    logIndex: 0,
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('chain listener', () => {
  it('watches only the configured registry address', () => {
    const harness = createHarness();

    harness.listener.start();

    expect(harness.watchEvent).toHaveBeenCalledOnce();
    expect(harness.getWatchOptions()?.address).toBe(registryAddress);
    harness.listener.stop();
  });

  it('waits for confirmations, hands off the identifier, and calls the provider', async () => {
    const harness = createHarness();
    harness.listener.start();

    harness.getWatchOptions()?.onLogs([authorizedLog()]);
    await flushPromises();

    expect(harness.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: transactionHash,
      confirmations: 2,
    });
    expect(harness.keyring.decryptSecret).toHaveBeenCalledWith('execute-agent');
    expect(harness.fetchImpl).toHaveBeenCalledWith('https://provider.test', {
      headers: {authorization: 'Bearer secret-key'},
    });
    expect(harness.logger.info).toHaveBeenCalledWith('Processed AgentAuthorized event', {
      requestId: 'request-1',
      transactionHash,
      logIndex: 0,
    });
    expect(harness.requestStore.get('request-1')?.state).toBe('completed');
    expect(harness.logger.info).not.toHaveBeenCalledWith(expect.stringContaining('secret-key'), expect.anything());
    harness.listener.stop();
  });

  it('isolates keyring and provider failures', async () => {
    const harness = createHarness();
    harness.keyring.decryptSecret.mockRejectedValueOnce(new Error('decrypt failed'));
    harness.listener.start();

    harness.getWatchOptions()?.onLogs([authorizedLog()]);
    await flushPromises();

    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalledWith(
      'AgentAuthorized processing failed',
      expect.any(Error),
    );
    expect(harness.requestStore.get('request-1')?.state).toBe('failed');
    harness.listener.stop();
  });

  it('suppresses duplicate delivery of the same log', async () => {
    const harness = createHarness();
    harness.listener.start();

    harness.getWatchOptions()?.onLogs([authorizedLog()]);
    harness.getWatchOptions()?.onLogs([authorizedLog()]);
    await flushPromises();

    expect(harness.keyring.decryptSecret).toHaveBeenCalledOnce();
    expect(harness.fetchImpl).toHaveBeenCalledOnce();
    harness.listener.stop();
  });

  it('restarts after a watcher error and stops cleanly', () => {
    vi.useFakeTimers();
    const harness = createHarness();

    harness.listener.start();
    harness.getWatchOptions()?.onError(new Error('rpc disconnected'));
    vi.advanceTimersByTime(10);

    expect(harness.watchEvent).toHaveBeenCalledTimes(2);
    expect(harness.unwatch).toHaveBeenCalledOnce();

    harness.listener.stop();
    expect(harness.unwatch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});