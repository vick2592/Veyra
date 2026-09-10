import { createHash, hkdfSync } from 'node:crypto';
import { VaultError } from './types.js';

/**
 * BIP32 non-hardened indices are 31 bits. Deriving the index inside that range
 * keeps the value usable as a real derivation path segment if the Ledger CLI
 * later exposes child derivation directly.
 */
const LEAF_INDEX_SPACE = 0x8000_0000;

const HKDF_INFO = 'veyra/user-secret-key/v1';
const KEY_BYTES = 32;

/**
 * Map a World ID nullifier to a stable leaf index.
 *
 * Deterministic on purpose: the same person always resolves to the same index,
 * so re-login needs no lookup, concurrent registrations cannot race for a
 * counter, and losing the database costs nothing.
 */
export function leafIndexFromNullifier(nullifier: string): number {
  const trimmed = nullifier.trim();
  if (trimmed.length === 0) {
    throw new VaultError('A World ID nullifier is required to derive a user key');
  }

  const digest = createHash('sha256').update(trimmed, 'utf8').digest();
  // Top bit cleared so the result stays inside the non-hardened index space.
  return digest.readUInt32BE(0) % LEAF_INDEX_SPACE;
}

/**
 * Derive a per-user key from a root secret.
 *
 * HKDF rather than raw hashing: it is the standard construction for turning one
 * high-entropy secret into many independent subkeys, and it is what keeps one
 * user's key from telling you anything about another's.
 *
 * NOTE: this isolates users from each other, not from the server. Whoever holds
 * the root can derive every user's key. That is inherent to the design — the
 * server must be able to decrypt on a user's behalf — and is worth stating
 * plainly rather than implying per-user secrecy we do not have.
 */
export function deriveKeyFromRoot(rootSecret: Buffer | string, leafIndex: number): Buffer {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= LEAF_INDEX_SPACE) {
    throw new VaultError(`Leaf index out of range: ${leafIndex}`);
  }

  const root = typeof rootSecret === 'string' ? Buffer.from(rootSecret, 'utf8') : rootSecret;
  if (root.length === 0) {
    throw new VaultError('The vault root secret is empty');
  }

  const salt = Buffer.alloc(4);
  salt.writeUInt32BE(leafIndex, 0);

  return Buffer.from(hkdfSync('sha256', root, salt, HKDF_INFO, KEY_BYTES));
}
