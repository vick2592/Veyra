import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring } from './keyring.js';
import { createWorldIdVerifier, getWorldIdConfig } from './world-id.js';

export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  if (config.worldAppId !== undefined && config.worldAction !== undefined && config.walletPass !== undefined) {
    const verifier = createWorldIdVerifier(getWorldIdConfig(config));
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
