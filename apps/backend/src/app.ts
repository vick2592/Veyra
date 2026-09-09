import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring } from './keyring.js';
import { createPendingRequestStore } from './queue/store.js';
import { createBazanticRouter } from './routes/bazantic.js';
import { createBazanticAdapter } from './services/bazantic.js';
import { createWorldIdSignHandler, createWorldIdVerifier, getWorldIdConfig } from './world-id.js';

export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  const requestStore = createPendingRequestStore();
  const bazantic = createBazanticAdapter(async (_request, headers) => {
    const paymentReference = headers['x-payment-reference'] ?? headers['x-payment'];
    if (paymentReference === undefined) {
      return undefined;
    }
    const reference = Array.isArray(paymentReference) ? paymentReference[0] : paymentReference;
    return reference === undefined ? undefined : {reference, settledAt: new Date().toISOString()};
  });
  app.use('/api/bazantic', createBazanticRouter({store: requestStore, adapter: bazantic}));

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
