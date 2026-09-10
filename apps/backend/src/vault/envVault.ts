import { decryptWithKey, encryptWithKey } from './crypto.js';
import { deriveKeyFromRoot, leafIndexFromNullifier } from './derive.js';
import { VaultError, type SecretVault, type UserKeyHandle } from './types.js';

export type EnvVaultConfig = {
  /** Root secret this driver derives every user key from. */
  masterSecret: string;
};

/**
 * Development driver. The root secret comes from the environment instead of a
 * Ledger, so the full multi-user flow runs on any machine.
 *
 * This exists so the team is not blocked on one physical device. It is NOT a
 * production path: the root sits in an env var, which means anyone with process
 * access can derive every user's key.
 */
export function createEnvVault(config: EnvVaultConfig): SecretVault {
  if (config.masterSecret.length < 32) {
    throw new VaultError('VAULT_MASTER_SECRET must be at least 32 characters');
  }

  return {
    driver: 'env',

    async deriveUserKey(nullifier: string): Promise<UserKeyHandle> {
      const leafIndex = leafIndexFromNullifier(nullifier);
      return {leafIndex, key: deriveKeyFromRoot(config.masterSecret, leafIndex)};
    },

    async encrypt(handle: UserKeyHandle, plaintext: string): Promise<string> {
      return encryptWithKey(handle.key, plaintext);
    },

    async decrypt(handle: UserKeyHandle, ciphertextHex: string): Promise<string> {
      return decryptWithKey(handle.key, ciphertextHex);
    },
  };
}
