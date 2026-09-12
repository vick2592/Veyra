'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Robot01Icon } from '@hugeicons/core-free-icons';
import { useAccount, usePublicClient } from 'wagmi';
import { Drawer } from '@/components/ui/Drawer';
import { StatusPill, type AgentStatus } from './StatusPill';
import { getActionNarrative } from '@/lib/demoNarrative';
import { formatErrorMessage } from '@/lib/formatError';
import { fetchSecretsOf, type SecretSummary } from '@/lib/secrets';
import { registryAddress } from '@/lib/worldIdAuthorization';
import { fetchAgentAuthorizedLogs, formatRelativeTime, resolveSecretLabel, type ActivityEntry } from '@/lib/activityLog';
import type { PendingRequest } from '@/components/request/AccessRequestModal';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export type DrawerAgent = {
  address: string;
  label: string;
  status: AgentStatus;
  description: string;
};

export function AgentDetailDrawer({
  open,
  agent,
  onClose,
  disableSimulate,
  onSimulated,
}: {
  open: boolean;
  agent: DrawerAgent | null;
  onClose: () => void;
  /** True when some other pending request is already open elsewhere on the page. */
  disableSimulate: boolean;
  onSimulated: (request: PendingRequest) => void;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [recent, setRecent] = useState<ActivityEntry[] | null>(null);
  const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
  const [selectedSecretLabel, setSelectedSecretLabel] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || agent === null || !isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setRecent(null);
      return;
    }
    let active = true;
    fetchAgentAuthorizedLogs(publicClient, address, registryAddress)
      .then((logs) => {
        if (!active) return;
        const forThisAgent = logs
          .filter((entry) => entry.agentAddress.toLowerCase() === agent.address.toLowerCase())
          .sort((a, b) => Number(b.authorizedAt) - Number(a.authorizedAt))
          .slice(0, 2);
        setRecent(forThisAgent);
      })
      .catch(() => active && setRecent([]));
    return () => {
      active = false;
    };
  }, [open, agent, address, isConnected, publicClient]);

  // The secret picker for "Simulate a request" — this wallet's own secrets,
  // not a hardcoded identifier, so any secret you've created can be requested.
  useEffect(() => {
    if (!open || !isConnected || address === undefined || publicClient === undefined || registryAddress === undefined) {
      setSecrets(null);
      return;
    }
    let active = true;
    fetchSecretsOf(publicClient, address, registryAddress)
      .then((rows) => active && setSecrets(rows))
      .catch(() => active && setSecrets([]));
    return () => {
      active = false;
    };
  }, [open, address, isConnected, publicClient]);

  useEffect(() => {
    if (secrets === null) {
      return;
    }
    const activeSecrets = secrets.filter((secret) => secret.active);
    setSelectedSecretLabel((current) =>
      activeSecrets.some((secret) => secret.label === current) ? current : activeSecrets[0]?.label ?? '',
    );
  }, [secrets]);

  useEffect(() => {
    setSimulateError(null);
  }, [agent?.address]);

  async function handleSimulate() {
    if (agent === null || selectedSecretLabel.length === 0) {
      return;
    }
    setIsSimulating(true);
    setSimulateError(null);
    try {
      const idempotencyKey = `agents-${crypto.randomUUID()}`;
      const paymentReference = `agents-payment-${Date.now()}`;
      const response = await fetch(`${backendUrl}/api/bazantic/requests`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Payment-Signature': paymentReference,
          'X-PAYMENT': paymentReference,
          'x-payment-reference': paymentReference,
        },
        body: JSON.stringify({
          secretIdentifier: selectedSecretLabel,
          agentAddress: agent.address,
          idempotencyKey,
        }),
      });
      const body = (await response.json().catch(() => null)) as (PendingRequest & { error?: string }) | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Request failed with HTTP ${response.status}.`);
      }
      if (body !== null) {
        onSimulated(body);
      }
    } catch (error) {
      setSimulateError(formatErrorMessage(error, 'The request could not be sent.'));
    } finally {
      setIsSimulating(false);
    }
  }

  if (agent === null) {
    return null;
  }

  const activeSecrets = secrets?.filter((secret) => secret.active) ?? [];

  return (
    <Drawer open={open} onClose={onClose}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--dark-500) text-white">
            <HugeiconsIcon icon={Robot01Icon} size={20} strokeWidth={1.5} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-(--dark-400)">{agent.label}</p>
              <StatusPill status={agent.status} />
            </div>
            <p className="font-mono text-xs text-(--dark-300)">
              {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-(--dark-300) hover:bg-(--dark-50)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-(--dark-300)">{agent.description}</p>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">Simulate a request</p>
        {secrets === null ? (
          <p className="mt-3 text-sm text-(--dark-300)">Loading your secrets...</p>
        ) : activeSecrets.length === 0 ? (
          <p className="mt-3 text-sm text-(--dark-300)">
            No active secrets yet.{' '}
            <Link href="/secrets" className="font-semibold text-(--purple-500)">
              Add one
            </Link>{' '}
            to simulate {agent.label} requesting it.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <select
              value={selectedSecretLabel}
              onChange={(event) => setSelectedSecretLabel(event.target.value)}
              disabled={isSimulating}
              className="w-full rounded-full border border-(--dark-50) bg-white px-5 py-3 text-sm text-(--dark-400) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
            >
              {activeSecrets.map((secret) => (
                <option key={secret.secretId} value={secret.label}>
                  {secret.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleSimulate()}
              disabled={isSimulating || disableSimulate}
              title={disableSimulate ? 'Resolve the open request first' : undefined}
              className="inline-flex items-center justify-center rounded-full border border-(--purple-500) px-6 py-3 text-sm font-semibold text-(--purple-500) transition hover:bg-(--purple-500)/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSimulating ? 'Sending request...' : `Simulate ${agent.label} requesting this`}
            </button>
            {simulateError !== null && <p className="text-sm text-(--dark-400)">{simulateError}</p>}
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">Recent activity</p>
        <div className="mt-3 flex flex-col gap-2">
          {recent === null ? (
            <p className="text-sm text-(--dark-300)">Loading...</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-(--dark-300)">No activity yet.</p>
          ) : (
            recent.map((entry) => {
              const narrative = getActionNarrative(resolveSecretLabel(entry.secretId));
              return (
                <div
                  key={entry.requestId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-(--dark-50) bg-white px-4 py-3 text-xs"
                >
                  <span className="truncate font-mono text-(--dark-400)">{narrative.technical}</span>
                  <span className="shrink-0 rounded-full bg-(--purple-500)/10 px-2 py-0.5 font-semibold text-(--purple-500)">
                    Allowed
                  </span>
                  <span className="shrink-0 text-(--dark-300)">{formatRelativeTime(entry.authorizedAt)}</span>
                </div>
              );
            })
          )}
        </div>
        <Link href="/activity" className="mt-3 inline-block text-xs font-semibold text-(--purple-500)">
          View all activity
        </Link>
      </div>

      <div className="mt-10">
        <button
          type="button"
          disabled
          title="Revoking is an owner-only kill switch on CapabilityRegistry, not a per-user action yet — no wallet connected here can call it."
          className="w-full rounded-full bg-(--dark-500)/40 px-6 py-3 text-sm font-semibold text-white cursor-not-allowed"
        >
          {agent.status === 'active' ? 'Revoke agent' : 'Reinstate agent'}
        </button>
      </div>
    </Drawer>
  );
}
