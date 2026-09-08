import { access, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring, KeyringError } from './keyring.js';

type WorldIdProofFixture = {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
};

describe('execute-agent handler', () => {
  const proof: WorldIdProofFixture = {
    proof: 'proof',
    merkle_root: 'root',
    nullifier_hash: 'nullifier',
    verification_level: 'orb',
  };

  it('verifies World ID before decrypting or calling the provider', async () => {
    const verifier = vi.fn().mockRejectedValue(new Error('invalid proof'));
    const keyring = { decryptSecret: vi.fn() };
    const fetchImpl = vi.fn();
    const response = createResponse();

    await createExecuteAgentHandler(verifier, keyring, { agentApiUrl: 'https://provider.test' }, fetchImpl)(
      { body: proofRequest(proof) } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(keyring.decryptSecret).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('executes the allowlisted action after successful verification', async () => {
    const verifier = vi.fn().mockResolvedValue({ nullifierHash: 'nullifier', verificationLevel: 'orb' });
    const keyring = { decryptSecret: vi.fn().mockResolvedValue('secret-key') };
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"model"}', { status: 200 }));
    const response = createResponse();

    await createExecuteAgentHandler(verifier, keyring, { agentApiUrl: 'https://provider.test' }, fetchImpl)(
      { body: proofRequest(proof) } as never,
      response as never,
    );

    expect(keyring.decryptSecret).toHaveBeenCalledWith('execute-agent');
    expect(fetchImpl).toHaveBeenCalledWith('https://provider.test', {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(response.status).toHaveBeenCalledWith(200);
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

function proofRequest(worldIdProof: WorldIdProofFixture) {
  return { action: 'execute-agent', ...worldIdProof };
}

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}