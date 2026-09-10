import { decryptWithKey, encryptWithKey } from './crypto.js';
import { deriveKeyFromRoot, leafIndexFromNullifier } from './derive.js';
import { VaultError, type SecretVault, type UserKeyHandle } from './types.js';

/**
 * Reads the root secret out of the Ledger Key Ring. Kept as a function so this
 * driver does not care whether that happens via `wallet-cli`, a future SDK, or
 * a test double.
 */
export type RootSecretReader = () => Promise<string>;

export type LkrpVaultConfig = {
  readRootSecret: RootSecretReader;
  /**
   * Cache the root in memory between calls. Off by default: every derivation
   * then costs a device round trip, which is slow but keeps the root out of
   * process memory for longer than a single operation.
   */
  cacheRoot?: boolean;
};

/**
 * Production driver. The root secret is held by a Ledger via Key Ring, and
 * per-user keys are derived from it.
 *
 * @remarks
 * Derivation happens in software (HKDF) rather than as on-device BIP32 child
 * derivation, because `wallet-cli ring decrypt` exposes a root secret, not a
 * derivation API. The practical difference: the root is briefly in process
 * memory during an operation. If the CLI later exposes child derivation, only
 * this file changes — the interface and every caller stay as they are.
 *
 * Users are isolated from each other, not from this server. Whoever holds the
 * root can derive every user's key. That is inherent: the server has to decrypt
 * on a user's behalf.
 */
export function createLkrpVault(config: LkrpVaultConfig): SecretVault {
  let cachedRoot: string | undefined;

  async function rootSecret(): Promise<string> {
    if (config.cacheRoot === true && cachedRoot !== undefined) {
      return cachedRoot;
    }

    const root = await config.readRootSecret();
    if (root.length === 0) {
      throw new VaultError('The Ledger Key Ring returned an empty root secret');
    }
    if (config.cacheRoot === true) {
      cachedRoot = root;
    }
    return root;
  }

  return {
    driver: 'lkrp',

    async deriveUserKey(nullifier: string): Promise<UserKeyHandle> {
      const leafIndex = leafIndexFromNullifier(nullifier);
      return {leafIndex, key: deriveKeyFromRoot(await rootSecret(), leafIndex)};
    },

    async encrypt(handle: UserKeyHandle, plaintext: string): Promise<string> {
      return encryptWithKey(handle.key, plaintext);
    },

    async decrypt(handle: UserKeyHandle, ciphertextHex: string): Promise<string> {
      return decryptWithKey(handle.key, ciphertextHex);
    },
  };
}
