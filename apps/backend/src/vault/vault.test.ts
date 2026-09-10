import { describe, expect, test } from 'vitest';
import {
  createEnvVault,
  createLkrpVault,
  createSecretVault,
  decryptWithKey,
  deriveKeyFromRoot,
  encryptWithKey,
  leafIndexFromNullifier,
  VaultError,
  vaultDriverFromEnv,
} from './index.js';

const MASTER = 'a'.repeat(48);
const NULLIFIER_A = '0x2a3f9c1d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c';
const NULLIFIER_B = '0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa';

describe('leaf index derivation', () => {
  test('is deterministic — a returning user resolves to the same key', () => {
    expect(leafIndexFromNullifier(NULLIFIER_A)).toBe(leafIndexFromNullifier(NULLIFIER_A));
  });

  test('separates different humans', () => {
    expect(leafIndexFromNullifier(NULLIFIER_A)).not.toBe(leafIndexFromNullifier(NULLIFIER_B));
  });

  test('stays inside the 31-bit non-hardened BIP32 index space', () => {
    for (let i = 0; i < 500; i += 1) {
      const index = leafIndexFromNullifier(`nullifier-${i}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(0x8000_0000);
      expect(Number.isInteger(index)).toBe(true);
    }
  });

  test('ignores surrounding whitespace', () => {
    expect(leafIndexFromNullifier(`  ${NULLIFIER_A}  `)).toBe(leafIndexFromNullifier(NULLIFIER_A));
  });

  test('rejects an empty nullifier', () => {
    expect(() => leafIndexFromNullifier('   ')).toThrow(VaultError);
  });
});

describe('key derivation', () => {
  test('different indices give unrelated keys', () => {
    const a = deriveKeyFromRoot(MASTER, 1);
    const b = deriveKeyFromRoot(MASTER, 2);
    expect(a.equals(b)).toBe(false);
    expect(a).toHaveLength(32);
  });

  test('same root and index reproduce the key exactly', () => {
    expect(deriveKeyFromRoot(MASTER, 42).equals(deriveKeyFromRoot(MASTER, 42))).toBe(true);
  });

  test('a different root gives a different key at the same index', () => {
    expect(deriveKeyFromRoot(MASTER, 7).equals(deriveKeyFromRoot('b'.repeat(48), 7))).toBe(false);
  });

  test('rejects an out-of-range index', () => {
    expect(() => deriveKeyFromRoot(MASTER, 0x8000_0000)).toThrow(VaultError);
    expect(() => deriveKeyFromRoot(MASTER, -1)).toThrow(VaultError);
  });

  test('rejects an empty root', () => {
    expect(() => deriveKeyFromRoot('', 1)).toThrow(VaultError);
  });
});

describe('authenticated encryption', () => {
  const key = deriveKeyFromRoot(MASTER, 5);

  test('round trips', () => {
    expect(decryptWithKey(key, encryptWithKey(key, 'sk-live-abc123'))).toBe('sk-live-abc123');
  });

  test('is non-deterministic — same plaintext, different ciphertext', () => {
    expect(encryptWithKey(key, 'same')).not.toBe(encryptWithKey(key, 'same'));
  });

  /// Ciphertext lives on a public chain, so a tampered blob must fail loudly
  /// rather than return plausible garbage.
  test('rejects tampered ciphertext', () => {
    const hex = encryptWithKey(key, 'secret');
    const flipped = hex.slice(0, -2) + (hex.slice(-2) === 'ff' ? '00' : 'ff');
    expect(() => decryptWithKey(key, flipped)).toThrow(VaultError);
  });

  test('rejects the wrong key — one user cannot read another user data', () => {
    const other = deriveKeyFromRoot(MASTER, 6);
    expect(() => decryptWithKey(other, encryptWithKey(key, 'secret'))).toThrow(VaultError);
  });

  test('rejects truncated and unversioned input', () => {
    expect(() => decryptWithKey(key, '00')).toThrow(VaultError);
    const hex = encryptWithKey(key, 'secret');
    expect(() => decryptWithKey(key, `02${hex.slice(2)}`)).toThrow(VaultError);
  });

  test('refuses to encrypt an empty secret', () => {
    expect(() => encryptWithKey(key, '')).toThrow(VaultError);
  });
});

describe('EnvVault', () => {
  const vault = createEnvVault({masterSecret: MASTER});

  test('round trips a secret for one user', async () => {
    const handle = await vault.deriveUserKey(NULLIFIER_A);
    expect(await vault.decrypt(handle, await vault.encrypt(handle, 'sk-abc'))).toBe('sk-abc');
  });

  /// The property the whole multi-user design rests on.
  test('one user cannot decrypt another user secret', async () => {
    const alice = await vault.deriveUserKey(NULLIFIER_A);
    const bob = await vault.deriveUserKey(NULLIFIER_B);
    const aliceSecret = await vault.encrypt(alice, 'alice-key');

    expect(alice.leafIndex).not.toBe(bob.leafIndex);
    await expect(vault.decrypt(bob, aliceSecret)).rejects.toThrow(VaultError);
  });

  test('a returning user re-derives the same key', async () => {
    const first = await vault.deriveUserKey(NULLIFIER_A);
    const ciphertext = await vault.encrypt(first, 'persisted');

    const laterSession = createEnvVault({masterSecret: MASTER});
    const second = await laterSession.deriveUserKey(NULLIFIER_A);

    expect(second.leafIndex).toBe(first.leafIndex);
    expect(await laterSession.decrypt(second, ciphertext)).toBe('persisted');
  });

  test('rejects a weak master secret', () => {
    expect(() => createEnvVault({masterSecret: 'short'})).toThrow(VaultError);
  });
});

describe('LkrpVault', () => {
  test('derives from the Ledger-held root', async () => {
    const vault = createLkrpVault({readRootSecret: async () => 'ledger-root-secret-material-xxxxx'});
    const handle = await vault.deriveUserKey(NULLIFIER_A);
    expect(await vault.decrypt(handle, await vault.encrypt(handle, 'sk-hw'))).toBe('sk-hw');
  });

  test('hits the device on every derivation unless caching is on', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return 'ledger-root-secret-material-xxxxx';
    };

    const uncached = createLkrpVault({readRootSecret: read});
    await uncached.deriveUserKey(NULLIFIER_A);
    await uncached.deriveUserKey(NULLIFIER_B);
    expect(reads).toBe(2);

    reads = 0;
    const cached = createLkrpVault({readRootSecret: read, cacheRoot: true});
    await cached.deriveUserKey(NULLIFIER_A);
    await cached.deriveUserKey(NULLIFIER_B);
    expect(reads).toBe(1);
  });

  test('fails closed on an empty root', async () => {
    const vault = createLkrpVault({readRootSecret: async () => ''});
    await expect(vault.deriveUserKey(NULLIFIER_A)).rejects.toThrow(VaultError);
  });

  /// Both drivers must agree, or code written against EnvVault would behave
  /// differently the moment the Ledger is attached.
  test('produces the same leaf index as EnvVault for the same human', async () => {
    const env = createEnvVault({masterSecret: MASTER});
    const lkrp = createLkrpVault({readRootSecret: async () => MASTER});

    const a = await env.deriveUserKey(NULLIFIER_A);
    const b = await lkrp.deriveUserKey(NULLIFIER_A);
    expect(b.leafIndex).toBe(a.leafIndex);
  });
});

describe('factory', () => {
  test('builds an env vault', () => {
    expect(createSecretVault({driver: 'env', masterSecret: MASTER}).driver).toBe('env');
  });

  test('builds an lkrp vault', () => {
    expect(createSecretVault({driver: 'lkrp', readRootSecret: async () => MASTER}).driver).toBe('lkrp');
  });

  test('fails closed when a driver is missing what it needs', () => {
    expect(() => createSecretVault({driver: 'env'})).toThrow(VaultError);
    expect(() => createSecretVault({driver: 'lkrp'})).toThrow(VaultError);
    expect(() => createSecretVault({driver: 'nope' as 'env'})).toThrow(VaultError);
  });

  test('reads the driver from the environment, defaulting to env', () => {
    expect(vaultDriverFromEnv({})).toBe('env');
    expect(vaultDriverFromEnv({VAULT_DRIVER: 'LKRP'})).toBe('lkrp');
    expect(() => vaultDriverFromEnv({VAULT_DRIVER: 'aws'})).toThrow(VaultError);
  });
});
