import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  WORLD_APP_ID: z.string().regex(/^app_/).optional(),
  WORLD_ACTION: z.string().min(1).optional(),
});

export type AppConfig = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigin: string;
  worldAppId?: string;
  worldAction?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(env);

  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    corsOrigin: parsed.CORS_ORIGIN,
    ...(parsed.WORLD_APP_ID === undefined ? {} : { worldAppId: parsed.WORLD_APP_ID }),
    ...(parsed.WORLD_ACTION === undefined ? {} : { worldAction: parsed.WORLD_ACTION }),
  };
}
