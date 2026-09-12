'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { getDismissedRequestIds } from '@/lib/dismissedRequests';

export type PendingRequestSummary = {
  requestId: string;
  agentAddress: string;
  secretIdentifier: string;
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

/**
 * Real pending-request polling, shared so the bell, /agents, and the
 * Dashboard all agree on what's actually waiting. Filters out anything the
 * viewer has already dismissed (see lib/dismissedRequests.ts) — the backend
 * queue has no cancel/deny transition, so a walked-away-from request stays
 * "pending_human_auth" until it expires; without this filter it kept
 * reappearing everywhere even after being dismissed once.
 */
export function usePendingRequests(): PendingRequestSummary[] {
  const { address } = useAccount();
  const [requests, setRequests] = useState<PendingRequestSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(`${backendUrl}/api/bazantic/pending`, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { requests?: PendingRequestSummary[] };
        const dismissedIds = address === undefined ? [] : getDismissedRequestIds(address);
        setRequests((body.requests ?? []).filter((request) => !dismissedIds.includes(request.requestId)));
      } catch {
        // Best-effort — the bell just won't update this tick.
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [address]);

  return requests;
}
