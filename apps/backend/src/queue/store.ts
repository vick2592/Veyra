import type { PendingRequest, PendingRequestState } from './types.js';
import { assertTransition } from './types.js';

export type CreatePendingRequestInput = Omit<
  PendingRequest,
  'state' | 'createdAt' | 'updatedAt' | 'attemptCount'
> & {
  createdAt?: string;
};

export type PendingRequestStore = {
  create(input: CreatePendingRequestInput): PendingRequest;
  get(requestId: string): PendingRequest | undefined;
  getByIdempotencyKey(idempotencyKey: string): PendingRequest | undefined;
  transition(
    requestId: string,
    state: PendingRequestState,
    details?: Pick<PendingRequest, 'result' | 'errorCode' | 'errorMessage'>,
  ): PendingRequest;
  claimForExecution(requestId: string): PendingRequest | undefined;
  listPending(now?: string): PendingRequest[];
  expireBefore(now?: string): number;
};

export function createPendingRequestStore(): PendingRequestStore {
  const requests = new Map<string, PendingRequest>();
  const idempotencyKeys = new Map<string, string>();

  function get(requestId: string): PendingRequest | undefined {
    return requests.get(requestId);
  }

  function create(input: CreatePendingRequestInput): PendingRequest {
    if (requests.has(input.requestId)) {
      throw new Error(`Pending request already exists: ${input.requestId}`);
    }
    if (idempotencyKeys.has(input.idempotencyKey)) {
      throw new Error(`Idempotency key already exists: ${input.idempotencyKey}`);
    }

    const now = input.createdAt ?? new Date().toISOString();
    const request: PendingRequest = {
      ...input,
      state: 'pending_human_auth',
      createdAt: now,
      updatedAt: now,
      attemptCount: 0,
    };
    requests.set(request.requestId, request);
    idempotencyKeys.set(request.idempotencyKey, request.requestId);
    return request;
  }

  function getByIdempotencyKey(idempotencyKey: string): PendingRequest | undefined {
    const requestId = idempotencyKeys.get(idempotencyKey);
    return requestId === undefined ? undefined : requests.get(requestId);
  }

  function transition(
    requestId: string,
    state: PendingRequestState,
    details: Pick<PendingRequest, 'result' | 'errorCode' | 'errorMessage'> = {},
  ): PendingRequest {
    const current = requests.get(requestId);
    if (current === undefined) {
      throw new Error(`Pending request not found: ${requestId}`);
    }
    assertTransition(current.state, state);

    const updated: PendingRequest = {
      ...current,
      ...details,
      state,
      updatedAt: new Date().toISOString(),
    };
    requests.set(requestId, updated);
    return updated;
  }

  function claimForExecution(requestId: string): PendingRequest | undefined {
    const current = requests.get(requestId);
    if (current === undefined || current.state !== 'pending_human_auth') {
      return undefined;
    }

    const claimed: PendingRequest = {
      ...current,
      state: 'executing',
      updatedAt: new Date().toISOString(),
      attemptCount: current.attemptCount + 1,
    };
    requests.set(requestId, claimed);
    return claimed;
  }

  return {
    create,
    get,
    getByIdempotencyKey,
    transition,
    claimForExecution,
    listPending(now = new Date().toISOString()): PendingRequest[] {
      return [...requests.values()]
        .filter((request) => request.state === 'pending_human_auth' && request.expiresAt > now)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    expireBefore(now = new Date().toISOString()): number {
      let expired = 0;
      for (const request of requests.values()) {
        if (request.state !== 'pending_human_auth' || request.expiresAt > now) {
          continue;
        }
        requests.delete(request.requestId);
        idempotencyKeys.delete(request.idempotencyKey);
        expired += 1;
      }
      return expired;
    },
  };
}