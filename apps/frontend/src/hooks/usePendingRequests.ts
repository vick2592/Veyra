'use client';

import { useEffect, useState } from 'react';

export type PendingRequestSummary = {
  requestId: string;
  agentAddress: string;
  secretIdentifier: string;
  status: 'pending_human_auth' | 'executing' | 'completed' | 'failed';
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

/**
 * Real pending-request polling, shared so the notification bell can show
 * real items instead of a bare count someone has to remember to pass in.
 */
export function usePendingRequests(): PendingRequestSummary[] {
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
        setRequests(body.requests ?? []);
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
  }, []);

  return requests;
}
