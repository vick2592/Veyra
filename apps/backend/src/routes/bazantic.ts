import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { PendingRequestStore } from '../queue/store.js';
import type { BazanticAdapter } from '../services/bazantic.js';

export type BazanticRoutesDependencies = {
  store: PendingRequestStore;
  adapter: BazanticAdapter;
  requestId?: () => string;
  defaultRequestTtlMs?: number;
};

function getPaymentHeaders(request: Request): Record<string, string | string[] | undefined> {
  return {
    'x-payment': request.headers['x-payment'],
    'x-payment-signature': request.headers['x-payment-signature'],
    'payment-signature': request.headers['payment-signature'],
    'x-payment-reference': request.headers['x-payment-reference'],
  };
}

function toStatusResponse(request: ReturnType<PendingRequestStore['get']>) {
  if (request === undefined) {
    return undefined;
  }

  return {
    requestId: request.requestId,
    status: request.state,
    agentAddress: request.agentAddress,
    secretIdentifier: request.secretIdentifier,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    expiresAt: request.expiresAt,
    ...(request.state === 'completed' ? {result: request.result} : {}),
    ...(request.state === 'failed'
      ? {error: {code: request.errorCode ?? 'execution_failed', message: request.errorMessage ?? 'Request failed'}}
      : {}),
  };
}

export function createBazanticRouter({
  store,
  adapter,
  requestId = () => `0x${randomBytes(32).toString('hex')}`,
  defaultRequestTtlMs = 15 * 60 * 1_000,
}: BazanticRoutesDependencies): Router {
  const router = Router();

  router.post('/requests', async (request: Request, response: Response): Promise<void> => {
    let parsed;
    try {
      parsed = adapter.parseRequest(request.body);
    } catch {
      response.status(400).json({error: 'Invalid Bazantic request'});
      return;
    }

    const existing = store.getByIdempotencyKey(parsed.idempotencyKey);
    if (existing !== undefined) {
      response.status(202).json(toStatusResponse(existing));
      return;
    }

    let payment;
    try {
      payment = await adapter.settle(parsed, getPaymentHeaders(request));
    } catch {
      response.status(502).json({error: 'Payment settlement failed'});
      return;
    }
    if (payment === undefined) {
      response.status(402).json({error: 'A valid Bazantic payment is required'});
      return;
    }

    const expiresAt = parsed.expiresAt ?? new Date(Date.now() + defaultRequestTtlMs).toISOString();
    const pending = store.create({
      requestId: requestId(),
      idempotencyKey: parsed.idempotencyKey,
      paymentReference: payment.reference,
      agentAddress: parsed.agentAddress,
      secretIdentifier: parsed.secretIdentifier,
      expiresAt,
    });
    response.status(202).json(toStatusResponse(pending));
  });

  router.get('/requests/:requestId', (request: Request, response: Response): void => {
    const requestId = request.params.requestId;
    const status = typeof requestId === 'string' ? toStatusResponse(store.get(requestId)) : undefined;
    if (status === undefined) {
      response.status(404).json({error: 'Request not found'});
      return;
    }
    response.json(status);
  });

  router.get('/pending', (_request: Request, response: Response): void => {
    response.json({requests: store.listPending() .map(toStatusResponse)});
  });

  return router;
}