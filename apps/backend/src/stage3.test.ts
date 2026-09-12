import { access, readFile, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring, KeyringError } from './keyring.js';
import { leafIndexFromAddress } from './secrets.js';
import { encryptWithKey } from './vault/crypto.js';
import { deriveKeyFromRoot } from './vault/derive.js';
import { createWorldIdSignHandler, createWorldIdVerifier } from './world-id.js';

const USER_ADDRESS = `0x${'c'.repeat(40)}` as const;

const idKitResponse = {
  protocol_version: '4.0',
  nonce: 'nonce',
  action: 'ledger-key-42',
  environment: 'production',
  responses: [{
    identifier: 'proof_of_human',
    proof: ['proof'],
    nullifier: 'nullifier',
    issuer_schema_id: 1,
    expires_at_min: 1,
  }],
};

describe('execute-agent handler', () => {
  it('verifies World ID before decrypting or calling the provider', async () => {
    const verifier = vi.fn().mockRejectedValue(new Error('invalid proof'));
    const keyring = { decryptSecret: vi.fn(), decryptUserSecret: vi.fn() };
    const fetchImpl = vi.fn();
    const response = createResponse();

    await createExecuteAgentHandler(verifier, keyring, { agentApiUrl: 'https://provider.test' }, fetchImpl)(
      { body: { rp_id: 'rp_test', secretIdentifier: 'ledger-key-42', idkitResponse: idKitResponse } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(keyring.decryptSecret).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('executes the allowlisted action after successful verification', async () => {
    const verifier = vi.fn().mockResolvedValue({ nullifierHash: 'nullifier', verificationLevel: 'orb' });
    const keyring = { decryptSecret: vi.fn().mockResolvedValue('secret-key'), decryptUserSecret: vi.fn() };
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"model"}', { status: 200 }));
    const response = createResponse();

    await createExecuteAgentHandler(verifier, keyring, { agentApiUrl: 'https://provider.test' }, fetchImpl)(
      { body: { rp_id: 'rp_test', secretIdentifier: 'ledger-key-42', idkitResponse: idKitResponse } } as never,
      response as never,
    );

    expect(keyring.decryptSecret).toHaveBeenCalledWith('execute-agent');
    expect(fetchImpl).toHaveBeenCalledWith('https://provider.test', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

describe('World ID 4 RP integration', () => {
  const config = {
    appId: 'app_test',
    rpId: 'rp_test',
    signingKey: '1'.repeat(64),
  };

  it('signs the requested secret identifier with a server-side key', () => {
    const response = createResponse();
    const handler = createWorldIdSignHandler(config);

    handler({ body: { action: 'ledger-key-42' } } as never, response as never);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      rp_id: 'rp_test',
      signature: expect.stringMatching(/^0x/),
      nonce: expect.any(String),
      created_at: expect.any(Number),
      expires_at: expect.any(Number),
    }));
  });

  it('rejects requests without an action', () => {
    const response = createResponse();
    const handler = createWorldIdSignHandler(config);

    handler({ body: {} } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'The requested action is not allowed' });
  });

  it('forwards the complete IDKit response to the V4 endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    const verifier = createWorldIdVerifier(config, fetchImpl);

    await expect(verifier('rp_test', idKitResponse, 'ledger-key-42')).resolves.toEqual({ nullifier: 'nullifier' });
    expect(fetchImpl).toHaveBeenCalledWith('https://developer.world.org/api/v4/verify/rp_test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(idKitResponse),
    });
  });

  it('rejects a proof whose action does not match the requested secret', async () => {
    const fetchImpl = vi.fn();
    const verifier = createWorldIdVerifier(config, fetchImpl);

    await expect(verifier('rp_test', idKitResponse, 'other-secret')).rejects.toMatchObject({
      name: 'WorldIdVerificationError',
      statusCode: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('logs the status and raw body before rejecting a non-OK response', async () => {
    const rawBody = '{"code":"invalid_proof"}';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(rawBody, {
      status: 400,
      statusText: 'Bad Request',
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const verifier = createWorldIdVerifier(config, fetchImpl);

    await expect(verifier('rp_test', idKitResponse, 'ledger-key-42')).rejects.toMatchObject({
      name: 'WorldIdVerificationError',
      statusCode: 400,
    });
    expect(consoleError).toHaveBeenCalledWith('World ID verification response', {
      status: 400,
      statusText: 'Bad Request',
      body: rawBody,
    });

    consoleError.mockRestore();
  });

  it('parses a successful response from the captured raw body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const verifier = createWorldIdVerifier({
      ...config,
      apiBaseUrl: 'https://staging-developer.world.org',
    }, fetchImpl);

    await expect(verifier('rp_test', idKitResponse, 'ledger-key-42')).resolves.toEqual({ nullifier: 'nullifier' });
    expect(fetchImpl).toHaveBeenCalledWith('https://staging-developer.world.org/api/v4/verify/rp_test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(idKitResponse),
    });

    consoleError.mockRestore();
  });
});

describe('keyring', () => {
  it('rejects actions outside the allowlist without invoking wallet-cli', async () => {
    const execFileImpl = vi.fn();
    const keyring = createKeyring({
      walletPass: 'pass',
      secretsEncPath: '/tmp/secrets.enc',
      keyName: 'veyra-root',
    }, execFileImpl as never);

    await expect(keyring.decryptSecret('not-allowlisted')).rejects.toBeInstanceOf(KeyringError);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('cleans up decrypted output after reading the allowlisted key', async () => {
    let outputPath = '';
    const execFileImpl = vi.fn(async (_file: string, args: readonly string[]) => {
      outputPath = args[5] ?? '';
      await writeFile(outputPath, 'AI_API_KEY=secret-key\n');
      return { stdout: '', stderr: '' };
    });
    const keyring = createKeyring({
      walletPass: 'pass',
      secretsEncPath: '/tmp/secrets.enc',
      keyName: 'veyra-root',
    }, execFileImpl as never);

    await expect(keyring.decryptSecret('execute-agent')).resolves.toBe('secret-key');
    await expect(access(outputPath)).rejects.toThrow();
    expect((await readFile(outputPath).catch(() => Buffer.from(''))).length).toBe(0);
  });
});

describe('keyring.decryptUserSecret', () => {
  const originalDemoMode = process.env.VEYRA_DEMO_MODE;

  afterEach(() => {
    process.env.VEYRA_DEMO_MODE = originalDemoMode;
  });

  it('shells out to wallet-cli ring decrypt scoped by the user\'s derived leaf, and cleans up', async () => {
    process.env.VEYRA_DEMO_MODE = 'false';
    let outputPath = '';
    let capturedArgs: readonly string[] = [];
    const execFileImpl = vi.fn(async (_file: string, args: readonly string[]) => {
      capturedArgs = args;
      outputPath = args[args.indexOf('--out') + 1] ?? '';
      await writeFile(outputPath, 'sk-live-abc123\n');
      return { stdout: '', stderr: '' };
    });
    const keyring = createKeyring({
      walletPass: 'pass',
      secretsEncPath: '/tmp/secrets.enc',
      keyName: 'veyra-root',
    }, execFileImpl as never);

    const leafIndex = leafIndexFromAddress(USER_ADDRESS);
    await expect(keyring.decryptUserSecret(USER_ADDRESS, '0xdeadbeef')).resolves.toBe('sk-live-abc123');
    expect(capturedArgs.slice(0, 4)).toEqual(['ring', 'decrypt', '--key', `veyra-user-${leafIndex}`]);
    await expect(access(outputPath)).rejects.toThrow();
  });

  it('rejects without invoking wallet-cli when no ciphertext is stored', async () => {
    process.env.VEYRA_DEMO_MODE = 'false';
    const execFileImpl = vi.fn();
    const keyring = createKeyring({
      walletPass: 'pass',
      secretsEncPath: '/tmp/secrets.enc',
      keyName: 'veyra-root',
    }, execFileImpl as never);

    await expect(keyring.decryptUserSecret(USER_ADDRESS, '0x')).rejects.toBeInstanceOf(KeyringError);
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('round trips through the software vault in demo mode, matching encryptSecretForUser exactly', async () => {
    process.env.VEYRA_DEMO_MODE = 'true';
    const execFileImpl = vi.fn();
    const keyring = createKeyring({
      walletPass: 'pass',
      secretsEncPath: '/tmp/secrets.enc',
      keyName: 'veyra-root',
    }, execFileImpl as never);

    const leafIndex = leafIndexFromAddress(USER_ADDRESS);
    const key = deriveKeyFromRoot('veyra-demo-master-secret-not-for-production!!', leafIndex);
    const ciphertextHex = `0x${encryptWithKey(key, 'sk-live-abc123')}`;

    await expect(keyring.decryptUserSecret(USER_ADDRESS, ciphertextHex)).resolves.toBe('sk-live-abc123');
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}