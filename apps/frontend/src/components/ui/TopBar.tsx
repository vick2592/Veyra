'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  IdVerifiedIcon,
  Notification03Icon,
} from '@hugeicons/core-free-icons';
import { useAccount, useDisconnect } from 'wagmi';
import { usePendingRequests } from '@/hooks/usePendingRequests';
import { getActionNarrative, getAgentLabel } from '@/lib/demoNarrative';

export type Tier = 'orb' | 'selfie';

const tierLabel: Record<Tier, string> = {
  orb: 'Orb Verified',
  selfie: 'Selfie Verified',
};

const explorerBaseUrl = 'https://sepolia.basescan.org/address/';

/**
 * Real notification list — the only thing this app can actually notify
 * about right now is a pending agent request awaiting your confirmation
 * (same queue /agents polls). Not a general notification system with
 * fabricated categories; grows if/when there's another real event to show.
 */
function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const pendingRequests = usePendingRequests();
  const pendingCount = pendingRequests.length;

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={pendingCount > 0 ? `${pendingCount} pending confirmations` : 'Notifications'}
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-(--dark-50) bg-white text-(--dark-400) transition hover:bg-(--dark-50)/40"
      >
        <HugeiconsIcon icon={Notification03Icon} size={20} strokeWidth={1.5} />
        {pendingCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--purple-500) px-1 text-[11px] font-semibold text-white">
            {pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="animate-veyra-pop-in absolute right-0 top-14 z-50 w-80 rounded-2xl border border-(--dark-50) bg-white p-4 text-sm text-(--dark-400) shadow-[0_16px_48px_rgba(4,8,19,0.16)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">Notifications</p>

          <div className="mt-3 flex flex-col gap-2">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-(--dark-300)">No notifications yet.</p>
            ) : (
              pendingRequests.map((request) => {
                const narrative = getActionNarrative(request.secretIdentifier);
                return (
                  <div key={request.requestId} className="rounded-xl bg-(--creame) px-3 py-2.5">
                    <p className="text-sm font-medium text-(--dark-400)">
                      {getAgentLabel(request.agentAddress)} wants {narrative.headline}
                    </p>
                    <p className="mt-0.5 text-xs text-(--dark-300)">Waiting for your confirmation</p>
                  </div>
                );
              })
            )}
          </div>

          {pendingRequests.length > 0 && (
            <Link
              href="/agents"
              onClick={() => setIsOpen(false)}
              className="mt-3 inline-block text-xs font-semibold text-(--purple-500)"
            >
              View in Agents
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function WalletChip({ tier }: { tier?: Tier }) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (!isConnected || address === undefined) {
    return null;
  }

  async function handleCopy() {
    if (address === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('idle');
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setConfirmingDisconnect(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex h-12 items-center gap-2 rounded-2xl bg-(--dark-500) px-3 text-sm font-medium text-white transition hover:bg-[#0d1424]"
      >
        {tier !== undefined && (
          <span className="flex items-center gap-1.5 border-r border-white/15 pr-3">
            <HugeiconsIcon icon={IdVerifiedIcon} size={16} strokeWidth={1.5} className="text-(--purple-500)" />
            {tierLabel[tier]}
          </span>
        )}
        <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.5} />
      </button>

      {isOpen && (
        <div className="animate-veyra-pop-in absolute right-0 top-14 z-50 w-80 rounded-2xl border border-(--dark-50) bg-white p-4 text-sm text-(--dark-400) shadow-[0_16px_48px_rgba(4,8,19,0.16)]">
          <p className="break-all text-xs text-(--dark-300)">{address}</p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="mt-2 flex items-center gap-2 text-xs font-semibold text-(--purple-500)"
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
            {copyState === 'copied' ? 'Copied' : 'Copy address'}
          </button>

          <p className="mt-4 text-xs text-(--dark-300)">Network: Base Sepolia</p>
          <a
            href={`${explorerBaseUrl}${address}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-2 text-xs font-semibold text-(--purple-500)"
          >
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={1.5} />
            View on explorer
          </a>

          <div className="mt-4 border-t border-(--dark-50) pt-3">
            {!confirmingDisconnect ? (
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                className="text-xs font-semibold text-(--dark-300) hover:text-(--dark-400)"
              >
                Disconnect wallet
              </button>
            ) : (
              <div>
                <p className="text-xs font-semibold text-(--dark-400)">Disconnect this wallet?</p>
                <p className="mt-1 text-xs text-(--dark-300)">
                  You&apos;ll need to reconnect to view your agents or approve requests.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      disconnect();
                      setIsOpen(false);
                      setConfirmingDisconnect(false);
                    }}
                    className="rounded-full bg-(--dark-500) px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDisconnect(false)}
                    className="rounded-full border border-(--dark-50) px-3 py-1.5 text-xs font-semibold text-(--dark-400)"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({ title, tier }: { title: string; tier?: Tier }) {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-10">
      <h1 className="text-2xl font-semibold text-(--dark-400)">{title}</h1>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <WalletChip tier={tier} />
      </div>
    </header>
  );
}
