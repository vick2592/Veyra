import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'dotenv';

const execFileAsync = promisify(execFile);

export type KeyringConfig = {
  walletPass: string;
  secretsEncPath: string;
  keyName: string;
};

export type SecretKeyring = {
  decryptSecret(action: string): Promise<string>;
};

const actionSecretNames: Record<string, string> = {
  'execute-agent': 'AI_API_KEY',
};

export class KeyringError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'KeyringError';
  }
}

function isDemoMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.VEYRA_DEMO_MODE === 'true';
}

/**
 * In development/demo mode, return the secret directly from environment
 * variables instead of invoking the hardware-wallet CLI. This allows the
 * execution pipeline to complete end-to-end when the on-chain contract
 * still holds mock ciphertext (e.g. 0x12345678).
 */
function getEnvSecret(secretName: string): string | undefined {
  // Map internal secret names to likely env var names for convenience.
  const envKey = secretName === 'AI_API_KEY' ? 'OPENAI_API_KEY' : secretName;
  return process.env[envKey] ?? process.env[secretName];
}

export function createKeyring(
  config: KeyringConfig,
  execFileImpl: typeof execFileAsync = execFileAsync,
): SecretKeyring {
  return {
    async decryptSecret(action: string): Promise<string> {
      const secretName = actionSecretNames[action];
      if (secretName === undefined) {
        throw new KeyringError('The requested action is not allowlisted');
      }

      // --- Development / demo fallback ---
      if (isDemoMode()) {
        const envSecret = getEnvSecret(secretName);
        if (envSecret !== undefined && envSecret.length > 0) {
          return envSecret;
        }
        // No env key available — fall through to real decryption attempt
        // so the error message is informative if something is misconfigured.
      }

      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'veyra-keyring-'));
      const outputPath = path.join(tempDirectory, 'secrets.env');

      try {
        await execFileImpl('wallet-cli', [
          'ring',
          'decrypt',
          '-i',
          config.secretsEncPath,
          '-o',
          outputPath,
          '--key',
          config.keyName,
        ], {
          env: { ...process.env, WALLET_PASS: config.walletPass },
          windowsHide: true,
        });

        const plaintext = await readFile(outputPath);
        const secrets = parse(plaintext.toString('utf8'));
        plaintext.fill(0);

        const secret = secrets[secretName];
        if (secret === undefined || secret.length === 0) {
          throw new KeyringError(`The decrypted key ${secretName} is missing`);
        }

        return secret;
      } catch (error) {
        if (error instanceof KeyringError) {
          throw error;
        }
        // --- Safe fallback for mock ciphertext on testnet ---
        if (isDemoMode()) {
          const envSecret = getEnvSecret(secretName);
          if (envSecret !== undefined && envSecret.length > 0) {
            return envSecret;
          }
        }
        throw new KeyringError('Ledger Key Ring decryption failed');
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },
  };
}