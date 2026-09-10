'use client';

import { useEffect, useState } from 'react';

type SimulatorState = 'idle' | 'submitting' | 'accepted' | 'error';

type PendingRequest = {
  requestId: string;
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
  agentAddress: string;
  secretIdentifier: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const backendUrl = 'http://localhost:3001';
const dummyAgentAddress = '0x0000000000000000000000000000000000000001';

async function fetchPendingRequests(signal?: AbortSignal): Promise<PendingRequest[]> {
  const response = await fetch(`${backendUrl}/api/bazantic/pending`, {signal});
  if (!response.ok) {
    throw new Error(`Pending requests failed with HTTP ${response.status}.`);
  }
  const body = await response.json() as {requests?: PendingRequest[]};
  return body.requests ?? [];
}

export default function SandboxPage() {
  const [simulatorState, setSimulatorState] = useState<SimulatorState>('idle');
  const [message, setMessage] = useState('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedSecretIdentifier, setSelectedSecretIdentifier] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function refreshPendingRequests() {
      try {
        const requests = await fetchPendingRequests(controller.signal);
        setPendingRequests(requests);
        setSelectedRequestId((currentId) => {
          if (currentId !== null && requests.some((request) => request.requestId === currentId)) {
            return currentId;
          }
          return null;
        });
        setSelectedSecretIdentifier((currentIdentifier) => {
          if (currentIdentifier !== null && requests.some((request) => request.secretIdentifier === currentIdentifier)) {
            return currentIdentifier;
          }
          return null;
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMessage(error instanceof Error ? error.message : 'Pending requests could not be loaded.');
        }
      }
    }

    void refreshPendingRequests();
    const interval = window.setInterval(() => {
      void refreshPendingRequests();
    }, 3_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  async function handleSimulateAgentRequest() {
    setSimulatorState('submitting');
    setMessage('Sending a mock paid agent request...');

    try {
      const idempotencyKey = `sandbox-${crypto.randomUUID()}`;
      const paymentReference = `sandbox-payment-${Date.now()}`;
      const response = await fetch(`${backendUrl}/api/bazantic/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Payment-Signature': paymentReference,
          'X-PAYMENT': paymentReference,
          'x-payment-reference': paymentReference,
        },
        body: JSON.stringify({
          secretIdentifier: 'openai-key',
          agentAddress: dummyAgentAddress,
          idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => null) as {
        requestId?: string;
        status?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? `Agent request failed with HTTP ${response.status}.`);
      }

      setSimulatorState('accepted');
      setMessage(`Request ${body?.requestId ?? 'accepted'} is ${body?.status ?? 'pending_human_auth'}.`);
      setPendingRequests(await fetchPendingRequests());
    } catch (error) {
      setSimulatorState('error');
      setMessage(error instanceof Error ? error.message : 'The simulated request could not be sent.');
    }
  }

  const isSubmitting = simulatorState === 'submitting';
  const selectedRequest = pendingRequests.find((request) => request.requestId === selectedRequestId);

  return (
    <main className="min-h-screen px-5 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto min-h-[calc(100vh-3rem)] max-w-6xl rounded-4xl border border-(--line) bg-[rgba(255,253,246,0.66)] p-6 shadow-[0_24px_80px_rgba(23,33,27,0.12)] backdrop-blur sm:min-h-[calc(100vh-5rem)] sm:p-10">
        <header className="flex items-center justify-between border-b border-(--line) pb-5">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em]">
            <span className="h-3 w-3 rounded-full bg-(--lime) ring-4 ring-[rgba(217,242,106,0.28)]" />
            Veyra Sandbox
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-(--muted)">Developer surface / 01</span>
        </header>

        <section className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-(--muted)">Agent request simulator</p>
            <h1 className="max-w-3xl text-5xl leading-[0.96] tracking-[-0.03em] sm:text-7xl">
              Put a request in the gate.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-(--muted) sm:text-xl">
              Create a local paid request for the human authorization flow. Queue selection and World ID authorization will appear here next.
            </p>
          </div>

          <div className="border-l border-(--line) pl-6 lg:mb-1">
            <p className="text-sm leading-6 text-(--muted)">
              This sandbox targets the allowlisted <strong className="font-semibold text-(--ink)">openai-key</strong> identifier and uses a local mock payment reference.
            </p>
          </div>
        </section>

        <section className="border-t border-(--line) pt-6" aria-live="polite">
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Incoming agent request</p>
              <p className="mt-2 text-2xl">Execute capability with openai-key</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-(--muted)">
                The simulator sends the request to the local Bazantic endpoint with a fresh idempotency key.
              </p>
              {message && (
                <p className={`mt-4 max-w-xl text-sm ${simulatorState === 'error' ? 'text-[#a83f31]' : simulatorState === 'accepted' ? 'text-[#28734a]' : 'text-(--muted)'}`}>
                  {message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSimulateAgentRequest}
              disabled={isSubmitting}
              className="min-w-60 rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting ? 'Sending request...' : 'Simulate Agent Request'}
            </button>
          </div>
        </section>

        <section className="mt-6 border-t border-(--line) pt-6" aria-live="polite">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--muted)">Pending queue</p>
              <p className="mt-2 text-sm leading-6 text-(--muted)">
                Select an active request to prepare it for human authorization.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.14em] text-(--muted)">
              {pendingRequests.length} active
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {pendingRequests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-(--line) px-4 py-5 text-sm text-(--muted)">
                No active requests. Simulate an agent request to populate the queue.
              </p>
            ) : pendingRequests.map((request) => {
              const isSelected = request.requestId === selectedRequestId;
              return (
                <button
                  key={request.requestId}
                  type="button"
                  onClick={() => {
                    setSelectedRequestId(request.requestId);
                    setSelectedSecretIdentifier(request.secretIdentifier);
                    setMessage(`Selected ${request.secretIdentifier} for authorization.`);
                  }}
                  className={`grid gap-3 rounded-2xl border px-4 py-4 text-left transition sm:grid-cols-[1fr_auto] sm:items-center ${isSelected ? 'border-(--ink) bg-white' : 'border-(--line) bg-white/45 hover:bg-white'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{request.secretIdentifier}</span>
                    <span className="mt-1 block text-xs text-(--muted)">
                      {request.requestId.slice(0, 14)}... · {request.agentAddress.slice(0, 8)}...{request.agentAddress.slice(-6)}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-[0.14em] text-(--muted)">
                    {request.status.replaceAll('_', ' ')} · expires {new Date(request.expiresAt).toLocaleTimeString()}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedRequest !== undefined && selectedSecretIdentifier !== null && (
            <p className="mt-4 text-sm text-(--muted)">
              Selected target: <strong className="font-semibold text-(--ink)">{selectedSecretIdentifier}</strong>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
