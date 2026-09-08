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
        throw new KeyringError('Ledger Key Ring decryption failed');
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },
  };
}