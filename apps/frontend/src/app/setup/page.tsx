'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight02Icon,
  LockKeyIcon,
  Tick02Icon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons';
import { useAccount, useConnect } from 'wagmi';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { SplitScreenShell } from '@/components/ui/SplitScreenShell';
import { TransactionStatus, type TransactionStep } from '@/components/ui/TransactionStatus';
import { useAddSecret } from '@/hooks/useAddSecret';
import { useRequiredChain } from '@/hooks/useRequiredChain';
import { useSetupStatus } from '@/hooks/useSetupStatus';

const ADD_SECRET_STEPS: TransactionStep[] = ['encrypting', 'wallet', 'mining', 'success'];

export default function SetupPage() {
  const router = useRouter();
  const { isReady, isSetUp } = useSetupStatus();
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const { stage, errorMessage, addSecret, reset: resetSecret } = useAddSecret();
  const { isWrongChain, isSwitching: isSwitchingChain, requiredChainName, switchToRequiredChain } = useRequiredChain();

  const isConnecting = connectStatus === 'pending';
  const isBusy = stage === 'encrypting' || stage === 'preparing' || stage === 'awaiting_signature' || stage === 'pending';
  const activeStep: TransactionStep | null =
    stage === 'encrypting'
      ? 'encrypting'
      : stage === 'preparing' || stage === 'awaiting_signature'
        ? 'wallet'
        : stage === 'pending'
          ? 'mining'
          : stage === 'confirmed'
            ? 'success'
            : null;
  const canCreateSecret =
    isConnected && secretName.trim().length > 0 && secretValue.trim().length > 0 && !isBusy && !isWrongChain;
  const canContinue = isConnected && stage === 'confirmed';

  // A wallet that's already registered with a secret is done with Setup —
  // don't make it redo "Create secret" (a real tx) just to unlock Continue.
  useEffect(() => {
    if (isReady && isSetUp) {
      router.replace('/dashboard');
    }
  }, [isReady, isSetUp, router]);

  if (!isReady || isSetUp) {
    return <FullScreenLoader />;
  }

  return (
    <SplitScreenShell heroImage="/hero-keyring.png">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-(--dark-300)">
        Setup
      </p>
      <h1 className="max-w-xl text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        Give your agent a scoped key, not a raw one.
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">
        Connect your wallet, then create a secret your agent can request access to — it never holds the raw value.
      </p>

      <div className="mt-10 flex flex-col gap-4">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <StepBadge index={1} complete={isConnected} />
            <p className="text-base font-medium text-(--dark-400)">Connect your wallet</p>
          </div>
          {isConnected && address !== undefined ? (
            <div className="pl-10 leading-tight sm:pl-0 sm:text-right">
              <p className="text-sm font-semibold text-(--dark-400)">Connected</p>
              <p className="font-mono text-xs text-(--dark-300)">{address.slice(0, 6)}...{address.slice(-4)}</p>
            </div>
          ) : (
            <Button
              variant="secondary"
              icon={Wallet01Icon}
              loading={isConnecting}
              loadingLabel="Connecting..."
              onClick={() => connectors[0] !== undefined && connect({ connector: connectors[0] })}
              disabled={connectors[0] === undefined}
            >
              Connect wallet
            </Button>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <StepBadge index={2} complete={stage === 'confirmed'} />
            <label htmlFor="secret-name" className="text-base font-medium text-(--dark-400)">
              Create a secret
            </label>
          </div>

          <div className="flex flex-col gap-3 pl-11 sm:flex-row">
            <input
              id="secret-name"
              type="text"
              value={secretName}
              onChange={(event) => {
                setSecretName(event.target.value);
                if (stage === 'confirmed' || stage === 'error') {
                  resetSecret();
                }
              }}
              disabled={!isConnected || isBusy}
              placeholder="openai-key"
              className="flex-1 rounded-full border border-(--dark-50) bg-white px-5 py-4 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
            />
            <input
              id="secret-value"
              type="password"
              autoComplete="off"
              value={secretValue}
              onChange={(event) => {
                setSecretValue(event.target.value);
                if (stage === 'confirmed' || stage === 'error') {
                  resetSecret();
                }
              }}
              disabled={!isConnected || isBusy}
              placeholder="sk-..."
              className="flex-1 rounded-full border border-(--dark-50) bg-white px-5 py-4 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
            />
          </div>

          <div className="pl-11">
            <Button
              variant="secondary"
              icon={LockKeyIcon}
              loading={isBusy}
              loadingLabel={
                stage === 'encrypting'
                  ? 'Encrypting...'
                  : stage === 'preparing' || stage === 'awaiting_signature'
                    ? 'Confirm in wallet...'
                    : 'Confirming...'
              }
              disabled={!canCreateSecret}
              onClick={() => void addSecret(secretName, secretValue)}
            >
              Create secret
            </Button>
          </div>

          {activeStep !== null && (
            <div className="pl-11">
              <TransactionStatus steps={ADD_SECRET_STEPS} active={activeStep} />
            </div>
          )}

          {isConnected && isWrongChain && (
            <div className="flex items-center gap-3 pl-11">
              <Button
                variant="secondary"
                icon={LockKeyIcon}
                loading={isSwitchingChain}
                loadingLabel="Switching network..."
                onClick={() => switchToRequiredChain()}
              >
                Switch to {requiredChainName}
              </Button>
              <p className="text-xs text-(--dark-300)">Wrong network for creating a secret.</p>
            </div>
          )}

          {stage === 'error' && errorMessage !== null && (
            <p className="pl-11 text-sm text-(--dark-400)">{errorMessage}</p>
          )}

          {stage === 'confirmed' && (
            <p className="pl-11 text-sm text-(--dark-300)">
              Secret created. Market Agent can now request access to it.
            </p>
          )}
          {!isConnected && (
            <p className="pl-11 text-sm text-(--dark-100)">Connect your wallet first.</p>
          )}
        </Card>
      </div>

      <div className="mt-10 flex flex-col items-end gap-2">
        {canContinue ? (
          <Link
            href="/dashboard"
            className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
          >
            Continue
            <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
          </Link>
        ) : (
          <>
            <Button variant="primary" icon={ArrowRight02Icon} iconPosition="trailing" disabled>
              Continue
            </Button>
            <p className="text-xs text-(--dark-100)">Complete both steps to continue.</p>
          </>
        )}
        <Link href="/sandbox" className="mt-2 text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)">
          Open developer sandbox
        </Link>
      </div>
    </SplitScreenShell>
  );
}

function StepBadge({ index, complete }: { index: number; complete: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
        complete ? 'animate-veyra-pop-in bg-(--purple-500) text-white' : 'border border-(--dark-50) text-(--dark-300)'
      }`}
    >
      {complete ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : index}
    </span>
  );
}
