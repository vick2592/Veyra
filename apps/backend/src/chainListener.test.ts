import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { createPendingRequestStore } from './queue/store.js';
import { createChainListener } from './services/chainListener.js';

const registryAddress = '0x00000000000000000000000000000000000000aa' as const;
const transactionHash = '0x00000000000000000000000000000000000000000000000000000000000000bb' as const;

function createHarness(overrides: {pollingIntervalMs?: number} = {}) {
  const getBlockNumber = vi.fn().mockResolvedValue(100n);
  const getLogs = vi.fn().mockResolvedValue([]);
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
    getBlockNumber,
    getLogs,
    waitForTransactionReceipt,
  } as unknown as PublicClient;
  const listener = createChainListener({
    rpcUrl: 'https://rpc.test',
    chainId: 84532,
    registryAddress,
    confirmations: 2,
    // Large by default so the background setInterval never fires mid-test —
    // only the immediate poll `start()` triggers is exercised, keeping
    // assertions deterministic instead of racing a real timer.
    pollingIntervalMs: overrides.pollingIntervalMs ?? 100_000,
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
    getBlockNumber,
    getLogs,
    waitForTransactionReceipt,
    keyring,
    fetchImpl,
    requestStore,
    logger,
  };
}

/** Matches the AgentAuthorized event's real shape: secretId/requestId only —
 * the plaintext secret identifier comes from the pending request store, not
 * the log itself. */
function authorizedLog(requestId = 'request-1') {
  return {
    args: {secretId: '0xsecretid', requestId},
    transactionHash,
    logIndex: 0,
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('chain listener', () => {
  it('polls the configured registry address for AgentAuthorized logs', async () => {
    const harness = createHarness();

    harness.listener.start();
    await flushPromises();

    expect(harness.getBlockNumber).toHaveBeenCalled();
    expect(harness.getLogs).toHaveBeenCalledWith(expect.objectContaining({address: registryAddress}));
    harness.listener.stop();
  });

  it('waits for confirmations, hands off the identifier, and calls the provider', async () => {
    const harness = createHarness();
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
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
    harness.listener.stop();
  });

  it('isolates keyring and provider failures', async () => {
    const harness = createHarness();
    harness.keyring.decryptSecret.mockRejectedValueOnce(new Error('decrypt failed'));
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
    await flushPromises();

    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalledWith(
      'AgentAuthorized processing failed',
      expect.any(Error),
    );
    expect(harness.requestStore.get('request-1')?.state).toBe('failed');
    harness.listener.stop();
  });

  it('suppresses duplicate delivery of the same log within one poll', async () => {
    const harness = createHarness();
    harness.getLogs.mockResolvedValueOnce([authorizedLog(), authorizedLog()]);
    harness.listener.start();
    await flushPromises();

    expect(harness.keyring.decryptSecret).toHaveBeenCalledOnce();
    expect(harness.fetchImpl).toHaveBeenCalledOnce();
    harness.listener.stop();
  });

  it('keeps polling on the next interval after a poll fails', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval']});
    const harness = createHarness({pollingIntervalMs: 50});
    harness.getBlockNumber.mockRejectedValueOnce(new Error('rpc unreachable'));

    harness.listener.start();
    await flushPromises();

    expect(harness.logger.error).toHaveBeenCalledWith('Chain listener poll failed', expect.any(Error));

    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();

    expect(harness.getBlockNumber).toHaveBeenCalledTimes(2);

    harness.listener.stop();
    vi.useRealTimers();
  });
});
