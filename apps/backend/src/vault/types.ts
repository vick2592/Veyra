/**
 * SecretVault — the seam between "who the user is" and "which key encrypts their
 * secrets".
 *
 * Two drivers implement it:
 *   - EnvVault   development. No hardware, so the whole flow runs on any machine.
 *   - LkrpVault  production. The root secret lives on a Ledger via Key Ring.
 *
 * That split exists so nobody is blocked on one physical device to work on the
 * rest of the system. Both drivers derive per-user keys the same way, so code
 * written against EnvVault behaves identically once the Ledger is attached.
 */

/** Identifies which per-user key to use. Derived, never assigned. */
export type UserKeyHandle = {
  /**
   * BIP32 leaf index for this user, derived deterministically from their World ID
   * nullifier. Deriving rather than assigning means no counter, no database, no
   * race between concurrent registrations, and a returning user always resolves
   * to the same key.
   *
   * Public by necessity — it is stored on chain so the server knows which key to
   * re-derive. An index reveals nothing without the root secret.
   */
  leafIndex: number;
  /** The derived key material. Never logged, never persisted, never leaves memory. */
  key: Buffer;
};

export type VaultDriver = 'env' | 'lkrp';

export type SecretVault = {
  readonly driver: VaultDriver;

  /**
   * Derive this user's key from their World ID nullifier.
   *
   * The nullifier is the right input because it is stable for a person and
   * unlinkable across apps — one human, one key, without us storing anything
   * that identifies them.
   */
  deriveUserKey(nullifier: string): Promise<UserKeyHandle>;

  /** Encrypt a secret under a user's key. Returns hex, for storing on chain. */
  encrypt(handle: UserKeyHandle, plaintext: string): Promise<string>;

  /** Decrypt a secret previously encrypted under the same user's key. */
  decrypt(handle: UserKeyHandle, ciphertextHex: string): Promise<string>;
};

export class VaultError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}
