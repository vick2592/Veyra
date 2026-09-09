import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring } from './keyring.js';
import { createWorldIdSignHandler, createWorldIdVerifier, getWorldIdConfig } from './world-id.js';

export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  if (
    config.worldIdAppId !== undefined &&
    config.worldIdRpId !== undefined &&
    config.worldIdSigningKey !== undefined
  ) {
    const worldIdConfig = getWorldIdConfig(config);
    app.post('/api/world-id/sign', createWorldIdSignHandler(worldIdConfig));
  }

  if (
    config.worldIdAppId !== undefined &&
    config.worldIdRpId !== undefined &&
    config.worldIdSigningKey !== undefined &&
    config.walletPass !== undefined
  ) {
    const worldIdConfig = getWorldIdConfig(config);
    const verifier = createWorldIdVerifier(worldIdConfig);
    const keyring = createKeyring({
      walletPass: config.walletPass,
      secretsEncPath: config.secretsEncPath,
      keyName: 'veyra-root',
    });
    app.post('/api/execute-agent', createExecuteAgentHandler(verifier, keyring, {
      agentApiUrl: config.agentApiUrl,
    }));
  }

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'veyra-backend',
      environment: config.nodeEnv,
    });
  });

  return app;
}
