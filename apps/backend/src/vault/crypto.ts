import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { VaultError } from './types.js';

/**
 * AES-256-GCM. Authenticated encryption matters here more than usual: the
 * ciphertext is stored on a public chain where anyone can hand us back a
 * modified blob, so we need decryption to fail loudly rather than return
 * plausible garbage.
 *
 * Wire format: nonce (12 bytes) || tag (16 bytes) || ciphertext, hex encoded.
 */
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 0x01;

export function encryptWithKey(key: Buffer, plaintext: string): string {
  if (key.length !== 32) {
    throw new VaultError('A 32-byte key is required for AES-256-GCM');
  }
  if (plaintext.length === 0) {
    throw new VaultError('Refusing to encrypt an empty secret');
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return Buffer.concat([Buffer.from([VERSION]), nonce, cipher.getAuthTag(), ciphertext]).toString('hex');
}

export function decryptWithKey(key: Buffer, ciphertextHex: string): string {
  if (key.length !== 32) {
    throw new VaultError('A 32-byte key is required for AES-256-GCM');
  }

  const raw = Buffer.from(ciphertextHex.replace(/^0x/, ''), 'hex');
  if (raw.length < 1 + NONCE_BYTES + TAG_BYTES + 1) {
    throw new VaultError('Ciphertext is too short to be valid');
  }

  const version = Buffer.from([raw[0] ?? 0]);
  if (!timingSafeEqual(version, Buffer.from([VERSION]))) {
    throw new VaultError('Unsupported ciphertext version');
  }

  const nonce = raw.subarray(1, 1 + NONCE_BYTES);
  const tag = raw.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES);
  const body = raw.subarray(1 + NONCE_BYTES + TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, tampered ciphertext, or a blob belonging to another user.
    throw new VaultError('Secret decryption failed');
  }
}
