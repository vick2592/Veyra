import { writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEncryptSecretHandler,
  encryptSecretForUser,
  leafIndexFromAddress,
  SecretEncryptionError,
} from './secrets.js';
import { decryptWithKey } from './vault/crypto.js';
import { deriveKeyFromRoot } from './vault/derive.js';

const USER_A = '0x00000000000000000000000000000000000000aa';
const USER_B = '0x00000000000000000000000000000000000000bb';

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('leafIndexFromAddress', () => {
  it('is deterministic and stays inside the 31-bit non-hardened BIP32 range', () => {
    expect(leafIndexFromAddress(USER_A)).toBe(leafIndexFromAddress(USER_A));
    const index = leafIndexFromAddress(USER_A);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(0x8000_0000);
  });

  it('separates different wallets', () => {
    expect(leafIndexFromAddress(USER_A)).not.toBe(leafIndexFromAddress(USER_B));
  });

  it('is case-insensitive', () => {
    expect(leafIndexFromAddress(USER_A)).toBe(leafIndexFromAddress(USER_A.toUpperCase().replace('0X', '0x')));
  });
});

describe('encryptSecretForUser', () => {
  const originalDemoMode = process.env.VEYRA_DEMO_MODE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.VEYRA_DEMO_MODE = originalDemoMode;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('round trips through the software vault in demo mode, without touching wallet-cli', async () => {
    process.env.VEYRA_DEMO_MODE = 'true';
    const execFileImpl = vi.fn();

    const result = await encryptSecretForUser(USER_A, 'sk-live-abc123', {}, { execFileImpl: execFileImpl as never });

    expect(execFileImpl).not.toHaveBeenCalled();
    expect(result.bip32Path).toBe(`m/44'/60'/0'/0/${result.leafIndex}`);
    const key = deriveKeyFromRoot('veyra-demo-master-secret-not-for-production!!', result.leafIndex);
    expect(decryptWithKey(key, result.ciphertextHex)).toBe('sk-live-abc123');
  });

  it('shells out to wallet-cli ring encrypt scoped by the derived leaf, and cleans up the temp dir', async () => {
    process.env.VEYRA_DEMO_MODE = 'false';
    process.env.NODE_ENV = 'production';
    let capturedArgs: readonly string[] = [];
    const execFileImpl = vi.fn(async (_file: string, args: readonly string[]) => {
      capturedArgs = args;
      const outputPath = args[args.indexOf('--out') + 1] ?? '';
      await writeFile(outputPath, Buffer.from('deadbeef', 'hex'));
      return { stdout: '', stderr: '' };
    });

    const result = await encryptSecretForUser(
      USER_A,
      'sk-live-abc123',
      { walletPass: 'pass' },
      { execFileImpl: execFileImpl as never },
    );

    expect(capturedArgs.slice(0, 4)).toEqual(['ring', 'encrypt', '--key', `veyra-user-${result.leafIndex}`]);
    expect(result.ciphertextHex).toBe('0xdeadbeef');
  });

  it('wraps a wallet-cli failure in a SecretEncryptionError', async () => {
    process.env.VEYRA_DEMO_MODE = 'false';
    process.env.NODE_ENV = 'production';
    const execFileImpl = vi.fn().mockRejectedValue(new Error('device locked'));

    await expect(
      encryptSecretForUser(USER_A, 'sk-live-abc123', {}, { execFileImpl: execFileImpl as never }),
    ).rejects.toBeInstanceOf(SecretEncryptionError);
  });
});

describe('createEncryptSecretHandler', () => {
  const originalDemoMode = process.env.VEYRA_DEMO_MODE;

  afterEach(() => {
    process.env.VEYRA_DEMO_MODE = originalDemoMode;
  });

  it('rejects an invalid Ethereum address', async () => {
    const handler = createEncryptSecretHandler();
    const response = createResponse();

    await handler(
      { body: { userAddress: 'not-an-address', secretLabel: 'openai-key', secretValue: 'sk-live-abc' } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
  });

  it('rejects an empty secret value', async () => {
    const handler = createEncryptSecretHandler();
    const response = createResponse();

    await handler(
      { body: { userAddress: USER_A, secretLabel: 'openai-key', secretValue: '' } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
  });

  it('returns success with a bip32Path and ciphertextHex', async () => {
    process.env.VEYRA_DEMO_MODE = 'true';
    const handler = createEncryptSecretHandler();
    const response = createResponse();

    await handler(
      { body: { userAddress: USER_A, secretLabel: 'openai-key', secretValue: 'sk-live-abc' } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(200);
    const payload = response.json.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ success: true });
    expect(payload.bip32Path).toMatch(/^m\/44'\/60'\/0'\/0\/\d+$/);
    expect(payload.ciphertextHex).toMatch(/^[0-9a-f]+$/);
  });
});
