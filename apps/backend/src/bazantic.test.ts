import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createBazanticRouter } from './routes/bazantic.js';
import { createPendingRequestStore } from './queue/store.js';
import { createBazanticAdapter } from './services/bazantic.js';
import express from 'express';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

function createHarness() {
  const app = express();
  app.use(express.json());
  const store = createPendingRequestStore();
  const settlement = vi.fn().mockResolvedValue({reference: 'payment-1', settledAt: '2026-09-09T00:00:00.000Z'});
  app.use('/api/bazantic', createBazanticRouter({
    store,
    adapter: createBazanticAdapter(settlement),
    requestId: () => 'request-1',
  }));
  return {app, store, settlement};
}

describe('Bazantic routes', () => {
  it('creates a pending request with a 202 response after payment settlement', async () => {
    const harness = createHarness();

    const response = await request(harness.app)
      .post('/api/bazantic/requests')
      .set('x-payment', 'payment-header')
      .send({
        secretIdentifier: 'ledger-key-42',
        agentAddress: '0xagent',
        idempotencyKey: 'client-request-1',
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({requestId: 'request-1', status: 'pending_human_auth'});
    expect(harness.settlement).toHaveBeenCalledOnce();
  });

  it('forwards a configured payment header to settlement', async () => {
    const app = express();
    app.use(express.json());
    const settlement = vi.fn().mockResolvedValue({reference: 'payment-custom', settledAt: '2026-09-09T00:00:00.000Z'});
    app.use('/api/bazantic', createBazanticRouter({
      store: createPendingRequestStore(),
      adapter: createBazanticAdapter(settlement),
      paymentHeader: 'x-bazantic-payment',
      requestId: () => 'request-custom',
    }));

    const response = await request(app)
      .post('/api/bazantic/requests')
      .set('x-bazantic-payment', 'custom-payment')
      .send({secretIdentifier: 'ledger-key-42', agentAddress: '0xagent', idempotencyKey: 'custom'});

    expect(response.status).toBe(202);
    expect(settlement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'x-bazantic-payment': 'custom-payment',
    }));
  });

  it('rejects an unpaid request without creating queue state', async () => {
    const harness = createHarness();
    harness.settlement.mockResolvedValueOnce(undefined);

    const response = await request(harness.app)
      .post('/api/bazantic/requests')
      .send({secretIdentifier: 'ledger-key-42', agentAddress: '0xagent', idempotencyKey: 'unpaid'});

    expect(response.status).toBe(402);
    expect(harness.store.listPending()).toHaveLength(0);
  });

  it('returns only the result for completed requests and sanitizes failures', async () => {
    const harness = createHarness();
    await request(harness.app)
      .post('/api/bazantic/requests')
      .set('x-payment', 'payment-header')
      .send({secretIdentifier: 'ledger-key-42', agentAddress: '0xagent', idempotencyKey: 'completed'});
    harness.store.claimForExecution('request-1');
    harness.store.transition('request-1', 'completed', {result: {ok: true}, errorMessage: 'must not leak'});

    const response = await request(harness.app).get('/api/bazantic/requests/request-1');

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({ok: true});
    expect(response.body.errorMessage).toBeUndefined();
  });

  it('lists pending requests', async () => {
    const harness = createHarness();
    await request(harness.app)
      .post('/api/bazantic/requests')
      .set('x-payment', 'payment-header')
      .send({secretIdentifier: 'ledger-key-42', agentAddress: '0xagent', idempotencyKey: 'pending'});

    const response = await request(harness.app).get('/api/bazantic/pending');

    expect(response.status).toBe(200);
    expect(response.body.requests).toHaveLength(1);
    expect(response.body.requests[0].status).toBe('pending_human_auth');
  });
});

describe('pending request store', () => {
  it('allows only atomic execution claims and terminal transitions', () => {
    const store = createPendingRequestStore();
    store.create({
      requestId: 'request-1',
      idempotencyKey: 'key-1',
      paymentReference: 'payment-1',
      agentAddress: '0xagent',
      secretIdentifier: 'ledger-key-42',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });

    expect(store.claimForExecution('request-1')?.state).toBe('executing');
    expect(store.claimForExecution('request-1')).toBeUndefined();
    expect(() => store.transition('request-1', 'completed', {result: {ok: true}})).not.toThrow();
    expect(() => store.transition('request-1', 'executing')).toThrow(/Invalid pending request transition/);
  });
});
describe('gateway token settlement (the real adapter, not a mock)', () => {
  const baseConfig = {
    ...loadConfig({
      NODE_ENV: 'test',
      BAZANTIC_PAY_TO: '0x685dd8760000000000000000000000000000dEaD',
    } as NodeJS.ProcessEnv),
  };
  const body = {
    secretIdentifier: 'openai-key',
    agentAddress: '0x685dd8760000000000000000000000000000dEaD',
    idempotencyKey: 'gw-1',
  };

  it('rejects an arbitrary payment header once a gateway token is configured', async () => {
    const app = createApp({...baseConfig, gatewayToken: 'a'.repeat(32)});
    const response = await request(app)
      .post('/api/bazantic/requests')
      .set('Payment-Signature', 'totally-fake-not-a-real-payment')
      .send(body);

    expect(response.status).toBe(402);
  });

  it('accepts the configured gateway token', async () => {
    const token = 'a'.repeat(32);
    const app = createApp({...baseConfig, gatewayToken: token});
    const response = await request(app)
      .post('/api/bazantic/requests')
      .set('Payment-Signature', token)
      .send({...body, idempotencyKey: 'gw-2'});

    expect(response.status).toBe(202);
  });

  it('stays permissive when no gateway token is set, so the local sandbox still works', async () => {
    const app = createApp(baseConfig);
    const response = await request(app)
      .post('/api/bazantic/requests')
      .set('Payment-Signature', 'sandbox-payment-123')
      .send({...body, idempotencyKey: 'gw-3'});

    expect(response.status).toBe(202);
  });
});
