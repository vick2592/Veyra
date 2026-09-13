import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { createExecuteAgentHandler } from './execute-agent.js';
import { createKeyring } from './keyring.js';
import { createPendingRequestStore } from './queue/store.js';
import type { PendingRequestStore } from './queue/store.js';
import { createBazanticRouter } from './routes/bazantic.js';
import { createEncryptSecretHandler } from './secrets.js';
import { createBazanticAdapter } from './services/bazantic.js';
import { createWorldIdSignHandler, createWorldIdVerifier, getWorldIdConfig } from './world-id.js';

/** apps/backend/openai.yaml, resolved relative to this module rather than cwd. */
const openApiSpecPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openai.yaml');

export type AppDependencies = {
  requestStore?: PendingRequestStore;
};

/** Constant-time compare that tolerates a length mismatch without throwing. */
function matchesGatewayToken(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (receivedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(receivedBytes, expectedBytes);
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  const requestStore = dependencies.requestStore ?? createPendingRequestStore();
  const paymentRequired = config.bazanticPayTo === undefined
    ? undefined
    : config.bazanticX402Version === 2
      ? {
          x402Version: 2,
          accepts: [{
            scheme: 'exact',
            network: `eip155:${config.chainId}`,
            amount: config.bazanticAmount,
            asset: config.bazanticAsset,
            payTo: config.bazanticPayTo,
            maxTimeoutSeconds: config.bazanticMaxTimeoutSeconds,
            extra: {name: 'USDC', version: '2'},
          }],
          resource: {url: '/api/bazantic/requests', description: 'Veyra agent capability request', mimeType: 'application/json'},
        }
      : {
          x402Version: 1,
          accepts: [{
            scheme: 'exact',
            network: config.bazanticNetwork,
            maxAmountRequired: config.bazanticAmount,
            asset: config.bazanticAsset,
            payTo: config.bazanticPayTo,
            maxTimeoutSeconds: config.bazanticMaxTimeoutSeconds,
            extra: {name: 'USDC', version: '2'},
          }],
        };
  const bazantic = createBazanticAdapter(async (_request, headers) => {
    const paymentReference = headers[config.bazanticPaymentHeader] ?? headers['x-payment'];
    if (paymentReference === undefined) {
      return undefined;
    }
    const reference = Array.isArray(paymentReference) ? paymentReference[0] : paymentReference;
    if (reference === undefined || reference.length === 0) {
      return undefined;
    }
    // Bazantic settles the x402 payment before forwarding, so Veyra never sees a
    // payment proof to verify — it sees a gateway token instead. Compare in
    // constant time: a plain === leaks the token a byte at a time under timing
    // analysis, and this header is reachable from the public tunnel.
    if (config.gatewayToken !== undefined && !matchesGatewayToken(reference, config.gatewayToken)) {
      return undefined;
    }
    return {reference, settledAt: new Date().toISOString()};
  });
  app.use('/api/bazantic', createBazanticRouter({
    store: requestStore,
    adapter: bazantic,
    paymentHeader: config.bazanticPaymentHeader,
    ...(paymentRequired === undefined ? {} : {paymentRequired}),
    defaultRequestTtlMs: config.pendingRequestTtlMs,
  }));

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

  app.post(
    '/api/secrets/encrypt',
    createEncryptSecretHandler(config.walletPass === undefined ? {} : { walletPass: config.walletPass }),
  );

  // Bazantic's `gateway add --spec-url` fetches the OpenAPI document
  // server-side, so it has to be reachable over HTTP — a file in the repo is
  // not enough. Served from disk rather than imported so editing the spec does
  // not need a rebuild.
  app.get('/openapi.yaml', (_request, response) => {
    response.type('application/yaml').sendFile(openApiSpecPath);
  });

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'veyra-backend',
      environment: config.nodeEnv,
    });
  });

  return app;
}
