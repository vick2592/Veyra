import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import { isAddress, keccak256, toBytes } from 'viem';
import { z } from 'zod';
import { deriveKeyFromRoot } from './vault/derive.js';
import { encryptWithKey } from './vault/crypto.js';

const execFileAsync = promisify(execFile);

/**
 * 31-bit, non-hardened BIP32 range. Mirrors
 * apps/frontend/src/lib/worldIdAuthorization.ts#deriveLeafIndex exactly — the
 * backend must land on the same leaf the frontend already commits on-chain via
 * registerUser, or later decryption looks up the wrong key.
 */
const LEAF_INDEX_SPACE = 0x8000_0000;

const encryptSecretRequestSchema = z.object({
  userAddress: z.string().refine((value) => isAddress(value), 'userAddress must be a valid Ethereum address'),
  secretLabel: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.-]+$/, 'secretLabel may only contain letters, numbers, dot, dash, underscore'),
  secretValue: z.string().min(1, 'secretValue must not be empty'),
});

export class SecretEncryptionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SecretEncryptionError';
  }
}

export function leafIndexFromAddress(address: string): number {
  const digest = keccak256(toBytes(address.toLowerCase()));
  return Number(BigInt(digest) % BigInt(LEAF_INDEX_SPACE));
}

function isDemoMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.VEYRA_DEMO_MODE === 'true';
}

export type EncryptSecretConfig = {
  walletPass?: string;
};

export type EncryptSecretDeps = {
  execFileImpl?: typeof execFileAsync;
};

export type EncryptSecretResult = {
  leafIndex: number;
  bip32Path: string;
  ciphertextHex: string;
};

/**
 * Encrypts a plaintext secret under a key scoped to this user's derived leaf.
 *
 * Production path shells out to `wallet-cli ring encrypt --key <name>` — the
 * real LKRP CLI, confirmed against `wallet-cli ring encrypt --help`, has no
 * `--path` flag; it only accepts an opaque `--key` name used to derive a
 * scoped hardware key. So the BIP32 path is derived and returned for display
 * (it identifies the leaf), while the actual hardware key is scoped by a
 * name built from that same leaf index.
 *
 * Demo path (VEYRA_DEMO_MODE=true or NODE_ENV=development, mirroring
 * keyring.ts's existing fallback convention) uses the same HKDF + AES-256-GCM
 * primitives as the tested vault/ module instead of touching real hardware.
 */
export async function encryptSecretForUser(
  userAddress: string,
  secretValue: string,
  config: EncryptSecretConfig = {},
  deps: EncryptSecretDeps = {},
): Promise<EncryptSecretResult> {
  const leafIndex = leafIndexFromAddress(userAddress);
  const bip32Path = `m/44'/60'/0'/0/${leafIndex}`;

  if (isDemoMode()) {
    const demoMasterSecret = process.env.VAULT_MASTER_SECRET ?? 'veyra-demo-master-secret-not-for-production!!';
    const key = deriveKeyFromRoot(demoMasterSecret, leafIndex);
    return { leafIndex, bip32Path, ciphertextHex: encryptWithKey(key, secretValue) };
  }

  const execFileImpl = deps.execFileImpl ?? execFileAsync;
  const keyName = `veyra-user-${leafIndex}`;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'veyra-secret-'));
  const inputPath = path.join(tempDirectory, 'plaintext.txt');
  const outputPath = path.join(tempDirectory, 'ciphertext.bin');

  try {
    await writeFile(inputPath, secretValue, { mode: 0o600 });
    await execFileImpl('wallet-cli', [
      'ring',
      'encrypt',
      '--key',
      keyName,
      '--input',
      inputPath,
      '--out',
      outputPath,
    ], {
      env: { ...process.env, ...(config.walletPass === undefined ? {} : { WALLET_PASS: config.walletPass }) },
      windowsHide: true,
    });

    const ciphertext = await readFile(outputPath);
    if (ciphertext.length === 0) {
      throw new SecretEncryptionError('Ledger Key Ring returned empty ciphertext');
    }
    return { leafIndex, bip32Path, ciphertextHex: `0x${ciphertext.toString('hex')}` };
  } catch (error) {
    if (error instanceof SecretEncryptionError) {
      throw error;
    }
    throw new SecretEncryptionError('Ledger Key Ring encryption failed');
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export function createEncryptSecretHandler(config: EncryptSecretConfig = {}, deps: EncryptSecretDeps = {}) {
  return async (request: Request, response: Response): Promise<void> => {
    const parsed = encryptSecretRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    try {
      const { bip32Path, ciphertextHex } = await encryptSecretForUser(
        parsed.data.userAddress,
        parsed.data.secretValue,
        config,
        deps,
      );
      response.status(200).json({ success: true, bip32Path, ciphertextHex });
    } catch (error) {
      const message = error instanceof SecretEncryptionError ? error.message : 'Secret encryption failed';
      response.status(502).json({ error: message });
    }
  };
}
