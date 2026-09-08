import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  WORLD_APP_ID: z.string().regex(/^app_/).optional(),
  WORLD_ACTION: z.string().min(1).optional(),
  WALLET_PASS: z.string().min(1).optional(),
  SECRETS_ENC_PATH: z.string().min(1).default(path.resolve(process.cwd(), '../../secrets.enc')),
  AGENT_API_URL: z.string().url().default('https://api.openai.com/v1/models'),
});

export type AppConfig = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigin: string;
  worldAppId?: string;
  worldAction?: string;
  walletPass?: string;
  secretsEncPath: string;
  agentApiUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    corsOrigin: parsed.CORS_ORIGIN,
    ...(parsed.WORLD_APP_ID === undefined ? {} : { worldAppId: parsed.WORLD_APP_ID }),
    ...(parsed.WORLD_ACTION === undefined ? {} : { worldAction: parsed.WORLD_ACTION }),
    ...(parsed.WALLET_PASS === undefined ? {} : { walletPass: parsed.WALLET_PASS }),
    secretsEncPath: parsed.SECRETS_ENC_PATH,
    agentApiUrl: parsed.AGENT_API_URL,
  };
}
