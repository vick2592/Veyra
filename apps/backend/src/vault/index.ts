import { createEnvVault } from './envVault.js';
import { createLkrpVault, type RootSecretReader } from './lkrpVault.js';
import { VaultError, type SecretVault, type VaultDriver } from './types.js';

export * from './types.js';
export { createEnvVault } from './envVault.js';
export { createLkrpVault } from './lkrpVault.js';
export { deriveKeyFromRoot, leafIndexFromNullifier } from './derive.js';
export { decryptWithKey, encryptWithKey } from './crypto.js';

export type VaultFactoryConfig = {
  driver: VaultDriver;
  masterSecret?: string | undefined;
  readRootSecret?: RootSecretReader | undefined;
  cacheRoot?: boolean | undefined;
};

/**
 * Pick a driver from configuration. Fails closed: an unknown driver, or a
 * driver missing what it needs, throws at startup rather than silently falling
 * back to something weaker.
 */
export function createSecretVault(config: VaultFactoryConfig): SecretVault {
  if (config.driver === 'env') {
    if (config.masterSecret === undefined) {
      throw new VaultError('VAULT_DRIVER=env requires VAULT_MASTER_SECRET');
    }
    return createEnvVault({masterSecret: config.masterSecret});
  }

  if (config.driver === 'lkrp') {
    if (config.readRootSecret === undefined) {
      throw new VaultError('VAULT_DRIVER=lkrp requires a root secret reader');
    }
    return createLkrpVault({
      readRootSecret: config.readRootSecret,
      ...(config.cacheRoot === undefined ? {} : {cacheRoot: config.cacheRoot}),
    });
  }

  throw new VaultError(`Unknown VAULT_DRIVER: ${String(config.driver)}`);
}

/** Read the driver from the environment, defaulting to the hardware-free path. */
export function vaultDriverFromEnv(env: NodeJS.ProcessEnv = process.env): VaultDriver {
  const raw = (env.VAULT_DRIVER ?? 'env').trim().toLowerCase();
  if (raw === 'env' || raw === 'lkrp') {
    return raw;
  }
  throw new VaultError(`Unknown VAULT_DRIVER: ${raw}`);
}
