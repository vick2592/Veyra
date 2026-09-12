import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  WORLD_ID_APP_ID: z.string().regex(/^app_/).optional(),
  WORLD_ID_RP_ID: z.string().regex(/^rp_/).optional(),
  WORLD_ID_SIGNING_KEY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/).optional(),
  WORLD_ID_API_BASE_URL: z.string().url().default('https://developer.world.org'),
  WALLET_PASS: z.string().min(1).optional(),
  SECRETS_ENC_PATH: z.string().min(1).default(path.resolve(process.cwd(), '../../secrets.enc')),
  AGENT_API_URL: z.string().url().default('https://api.openai.com/v1/models'),
  BAZANTIC_PAYMENT_HEADER: z.string().min(1).default('Payment-Signature'),
  BAZANTIC_X402_VERSION: z.coerce.number().int().refine((value) => value === 1 || value === 2).default(2),
  BAZANTIC_NETWORK: z.string().min(1).default('base-sepolia'),
  BAZANTIC_ASSET: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  BAZANTIC_PAY_TO: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  BAZANTIC_AMOUNT: z.string().regex(/^\d+$/).default('10000'),
  BAZANTIC_MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
  PENDING_REQUEST_TTL_MS: z.coerce.number().int().positive().default(15 * 60 * 1_000),
  RPC_URL: z.string().url().optional(),
  CHAIN_ID: z.coerce.number().int().positive().default(84532),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  // An empty string (LISTENER_STARTING_BLOCK= with no value) must be treated
  // the same as unset. Left to bare z.coerce.bigint(), BigInt('') is 0n, which
  // would silently pin the listener to scanning from genesis.
  LISTENER_STARTING_BLOCK: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.coerce.bigint().nonnegative().optional(),
  ),
  LISTENER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(2),
  LISTENER_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(4_000),
});

export type AppConfig = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigin: string;
  worldIdAppId?: string;
  worldIdRpId?: string;
  worldIdSigningKey?: string;
  worldIdApiBaseUrl: string;
  walletPass?: string;
  secretsEncPath: string;
  agentApiUrl: string;
  bazanticPaymentHeader: string;
  bazanticX402Version: 1 | 2;
  bazanticNetwork: string;
  bazanticAsset: `0x${string}`;
  bazanticPayTo?: `0x${string}`;
  bazanticAmount: string;
  bazanticMaxTimeoutSeconds: number;
  pendingRequestTtlMs: number;
  rpcUrl?: string;
  chainId: number;
  registryAddress?: `0x${string}`;
  listenerStartingBlock?: bigint;
  listenerConfirmations: number;
  listenerPollingIntervalMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    corsOrigin: parsed.CORS_ORIGIN,
    ...(parsed.WORLD_ID_APP_ID === undefined ? {} : { worldIdAppId: parsed.WORLD_ID_APP_ID }),
    ...(parsed.WORLD_ID_RP_ID === undefined ? {} : { worldIdRpId: parsed.WORLD_ID_RP_ID }),
    ...(parsed.WORLD_ID_SIGNING_KEY === undefined ? {} : { worldIdSigningKey: parsed.WORLD_ID_SIGNING_KEY }),
    worldIdApiBaseUrl: parsed.WORLD_ID_API_BASE_URL,
    ...(parsed.WALLET_PASS === undefined ? {} : { walletPass: parsed.WALLET_PASS }),
    secretsEncPath: parsed.SECRETS_ENC_PATH,
    agentApiUrl: parsed.AGENT_API_URL,
    bazanticPaymentHeader: parsed.BAZANTIC_PAYMENT_HEADER,
    bazanticX402Version: parsed.BAZANTIC_X402_VERSION as 1 | 2,
    bazanticNetwork: parsed.BAZANTIC_NETWORK,
    bazanticAsset: parsed.BAZANTIC_ASSET as `0x${string}`,
    ...(parsed.BAZANTIC_PAY_TO === undefined ? {} : {bazanticPayTo: parsed.BAZANTIC_PAY_TO as `0x${string}`}),
    bazanticAmount: parsed.BAZANTIC_AMOUNT,
    bazanticMaxTimeoutSeconds: parsed.BAZANTIC_MAX_TIMEOUT_SECONDS,
    pendingRequestTtlMs: parsed.PENDING_REQUEST_TTL_MS,
    ...(parsed.RPC_URL === undefined ? {} : { rpcUrl: parsed.RPC_URL }),
    chainId: parsed.CHAIN_ID,
    ...(parsed.REGISTRY_ADDRESS === undefined
      ? {}
      : { registryAddress: parsed.REGISTRY_ADDRESS as `0x${string}` }),
    ...(parsed.LISTENER_STARTING_BLOCK === undefined
      ? {}
      : { listenerStartingBlock: parsed.LISTENER_STARTING_BLOCK }),
    listenerConfirmations: parsed.LISTENER_CONFIRMATIONS,
    listenerPollingIntervalMs: parsed.LISTENER_POLLING_INTERVAL_MS,
  };
}
