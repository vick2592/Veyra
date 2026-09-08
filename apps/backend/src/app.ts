import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';

export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'veyra-backend',
      environment: config.nodeEnv,
    });
  });

  return app;
}
