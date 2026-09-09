import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createBazanticRouter } from './routes/bazantic.js';
import { createPendingRequestStore } from './queue/store.js';
import { createBazanticAdapter } from './services/bazantic.js';
import express from 'express';

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