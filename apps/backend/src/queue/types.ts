export const pendingRequestStates = [
  'pending_human_auth',
  'executing',
  'completed',
  'failed',
] as const;

export type PendingRequestState = (typeof pendingRequestStates)[number];

export type PendingRequest = {
  requestId: string;
  idempotencyKey: string;
  paymentReference: string;
  agentAddress: string;
  secretIdentifier: string;
  state: PendingRequestState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  attemptCount: number;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

const allowedTransitions: Record<PendingRequestState, readonly PendingRequestState[]> = {
  pending_human_auth: ['executing'],
  executing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export function canTransition(
  from: PendingRequestState,
  to: PendingRequestState,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(
  from: PendingRequestState,
  to: PendingRequestState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid pending request transition: ${from} -> ${to}`);
  }
}