import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { createPendingRequestStore } from './queue/store.js';
import { createChainListener } from './services/chainListener.js';

const registryAddress = `0x${'a'.repeat(40)}` as const;
const userAddress = `0x${'b'.repeat(40)}` as const;
const secretId = `0x${'11'.repeat(32)}` as const;
const transactionHash = `0x${'22'.repeat(32)}` as const;

function createHarness(pollingIntervalMs = 10_000) {
  // Advances by one block per call, like a real chain — a mock frozen at one
  // value would make the in-memory cursor outrun "latest" after the first
  // poll and every later poll would correctly no-op before calling getLogs.
  let currentBlock = 100n;
  const getBlockNumber = vi.fn().mockImplementation(async () => {
    const block = currentBlock;
    currentBlock += 1n;
    return block;
  });
  const getLogs = vi.fn().mockResolvedValue([]);
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({});
  const readContract = vi.fn().mockResolvedValue({
    ciphertext: '0xdeadbeef',
    label: 'openai-key',
    version: 1,
    storedAt: 123n,
    active: true,
  });
  const keyring = { decryptSecret: vi.fn(), decryptUserSecret: vi.fn().mockResolvedValue('secret-key') };
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  const logger = { error: vi.fn(), info: vi.fn() };
  const requestStore = createPendingRequestStore();
  requestStore.create({
    requestId: 'request-1',
    idempotencyKey: 'key-1',
    paymentReference: 'payment-1',
    agentAddress: '0xagent',
    secretIdentifier: 'openai-key',
    expiresAt: '2999-01-01T00:00:00.000Z',
  });
  const client = {
    getBlockNumber,
    getLogs,
    getBlockNumber,
    getLogs,
    waitForTransactionReceipt,
    readContract,
  } as unknown as PublicClient;
  const listener = createChainListener({
    rpcUrl: 'https://rpc.test',
    chainId: 84532,
    registryAddress,
    confirmations: 2,
    pollingIntervalMs,
  }, {
    keyring,
    agentConfig: { agentApiUrl: 'https://provider.test' },
    requestStore,
    fetchImpl,
    logger,
    client,
  });

  return {
    listener,
    getBlockNumber,
    getLogs,
    getBlockNumber,
    getLogs,
    waitForTransactionReceipt,
    readContract,
    keyring,
    fetchImpl,
    requestStore,
    logger,
  };
}

function authorizedLog(overrides: Partial<{ user: `0x${string}`; secretId: `0x${string}`; requestId: string }> = {}) {
  return {
    args: { user: userAddress, secretId, requestId: 'request-1', ...overrides },
    transactionHash,
    logIndex: 0,
  };
}

async function flushAsync(): Promise<void> {
  // The poll chain (getBlockNumber -> getLogs -> handleLog -> waitForTransactionReceipt
  // -> readContract -> decryptUserSecret -> fetch -> store.transition) is several
  // microtask hops deep; a couple of real macrotask ticks drains it since every mock
  // resolves immediately.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('chain listener', () => {
  it('polls the configured registry address for AgentAuthorized logs', async () => {
  it('polls the configured registry address for AgentAuthorized logs', async () => {
    const harness = createHarness();
    harness.listener.start();
    await flushAsync();

    expect(harness.getLogs).toHaveBeenCalledWith(expect.objectContaining({ address: registryAddress }));
    harness.listener.stop();
  });

  it('fetches the on-chain ciphertext and executes with the per-user decrypted key', async () => {
    const harness = createHarness();
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
    await flushAsync();

    expect(harness.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: transactionHash,
      confirmations: 2,
    });
    expect(harness.readContract).toHaveBeenCalledWith({
      address: registryAddress,
      abi: expect.anything(),
      functionName: 'getSecret',
      args: [userAddress, secretId],
    });
    expect(harness.keyring.decryptUserSecret).toHaveBeenCalledWith(userAddress, '0xdeadbeef');
    expect(harness.fetchImpl).toHaveBeenCalledWith('https://provider.test', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(harness.requestStore.get('request-1')?.state).toBe('completed');
    harness.listener.stop();
  });

  it('marks the request failed when the on-chain secret is inactive', async () => {
    const harness = createHarness();
    harness.readContract.mockResolvedValueOnce({
      ciphertext: '0xdeadbeef',
      label: 'openai-key',
      version: 1,
      storedAt: 123n,
      active: false,
    });
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
    await flushAsync();

    expect(harness.keyring.decryptUserSecret).not.toHaveBeenCalled();
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.requestStore.get('request-1')?.state).toBe('failed');
    harness.listener.stop();
  });

  it('marks the request failed when no ciphertext is stored at all', async () => {
    const harness = createHarness();
    harness.readContract.mockResolvedValueOnce({
      ciphertext: '0x',
      label: '',
      version: 0,
      storedAt: 0n,
      active: false,
    });
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
    await flushAsync();

    expect(harness.keyring.decryptUserSecret).not.toHaveBeenCalled();
    expect(harness.requestStore.get('request-1')?.state).toBe('failed');
    harness.listener.stop();
  });

  it('isolates a hardware decryption failure — marks failed without calling the provider', async () => {
    const harness = createHarness();
    harness.keyring.decryptUserSecret.mockRejectedValueOnce(new Error('Ledger Key Ring decryption failed for user secret'));
    harness.getLogs.mockResolvedValueOnce([authorizedLog()]);
    harness.listener.start();
    await flushAsync();

    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalledWith('AgentAuthorized processing failed', expect.any(Error));
    expect(harness.requestStore.get('request-1')?.state).toBe('failed');
    harness.listener.stop();
  });

  it('ignores an AgentAuthorized event with no matching pending request', async () => {
    const harness = createHarness();
    harness.getLogs.mockResolvedValueOnce([authorizedLog({ requestId: 'unknown-request' })]);
    harness.listener.start();
    await flushAsync();

    expect(harness.readContract).not.toHaveBeenCalled();
    expect(harness.keyring.decryptUserSecret).not.toHaveBeenCalled();
    expect(harness.logger.info).toHaveBeenCalledWith(
      'Ignored AgentAuthorized event without a pending request',
      expect.objectContaining({ requestId: 'unknown-request' }),
    );
    harness.listener.stop();
  });

  it('suppresses duplicate delivery of the same log across polls', async () => {
    const harness = createHarness(15);
    // A real node wouldn't re-return an already-scanned log, but returning
    // it on every poll proves the seenLogs/processingLogs de-dup guard holds
    // even if one did.
    harness.getLogs.mockResolvedValue([authorizedLog()]);
    harness.listener.start();

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(harness.getLogs.mock.calls.length).toBeGreaterThan(1);
    expect(harness.keyring.decryptUserSecret).toHaveBeenCalledOnce();
    expect(harness.fetchImpl).toHaveBeenCalledOnce();
    harness.listener.stop();
  });
});

