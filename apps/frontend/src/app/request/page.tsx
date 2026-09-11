'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccessRequestToast, type AccessRequest } from '@/components/request/AccessRequestToast';
import { Card } from '@/components/ui/Card';

type PendingRequest = AccessRequest & {
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function fetchPendingRequests(signal?: AbortSignal): Promise<PendingRequest[]> {
  const response = await fetch(`${backendUrl}/api/bazantic/pending`, { signal });
  if (!response.ok) {
    throw new Error(`Pending requests failed with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { requests?: PendingRequest[] };
  return body.requests ?? [];
}

export default function RequestPage() {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isEvaluated, setIsEvaluated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      try {
        const requests = await fetchPendingRequests(controller.signal);
        setPendingRequests(requests);
        setLoadError(null);
        setSelectedRequestId((current) => {
          if (current !== null && requests.some((request) => request.requestId === current)) {
            return current;
          }
          return requests[0]?.requestId ?? null;
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadError(error instanceof Error ? error.message : 'Pending requests could not be loaded.');
        }
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const selectedRequest = pendingRequests.find((request) => request.requestId === selectedRequestId);

  function handleEvaluate() {
    setIsEvaluating(true);
    window.setTimeout(() => {
      setIsEvaluating(false);
      setIsEvaluated(true);
    }, 500);
  }

  function handleCancel() {
    setSelectedRequestId(null);
    setIsEvaluated(false);
  }

  return (
    <main className="min-h-screen bg-(--creame) px-6 py-6 sm:px-10">
      <header className="flex items-center gap-3">
        <div style={{ width: 28, height: 24 }}>
          <img src="/veyra-mark.svg" alt="Veyra" className="h-full w-full object-contain" />
        </div>
        <span className="text-lg font-semibold text-(--dark-400)">Veyra</span>
      </header>

      <div className="mx-auto mt-16 max-w-xl">
        {selectedRequest === undefined ? (
          <Card>
            <p className="text-sm leading-6 text-(--dark-300)">
              {loadError ?? 'No pending requests. Waiting for an agent to submit one.'}
            </p>
          </Card>
        ) : isEvaluated ? (
          <Card>
            <p className="text-sm leading-6 text-(--dark-300)">
              Request evaluated. The Tier &amp; Policy Result screen for this request is next.
            </p>
          </Card>
        ) : (
          <AccessRequestToast
            request={selectedRequest}
            isEvaluating={isEvaluating}
            onEvaluate={handleEvaluate}
            onCancel={handleCancel}
          />
        )}

        <Link
          href="/sandbox"
          className="mt-6 block text-center text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
        >
          Open developer sandbox
        </Link>
      </div>
    </main>
  );
}
