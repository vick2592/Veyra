'use client';

import { useState } from 'react';
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
import { SplitScreenShell } from '@/components/ui/SplitScreenShell';

type SecretState = 'empty' | 'creating' | 'created';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const [secretName, setSecretName] = useState('');
  const [secretState, setSecretState] = useState<SecretState>('empty');

  const isConnecting = connectStatus === 'pending';
  const canCreateSecret = isConnected && secretName.trim().length > 0 && secretState !== 'creating';
  const canContinue = isConnected && secretState === 'created';

  function handleCreateSecret() {
    if (!canCreateSecret) {
      return;
    }
    setSecretState('creating');
    window.setTimeout(() => setSecretState('created'), 450);
  }

  return (
    <SplitScreenShell>
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-(--dark-300)">
        Setup
      </p>
      <h1 className="max-w-xl text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        Give your agent a scoped key, not a raw one.
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">
        Connect your wallet, then create a secret your agent can request — never hold directly.
      </p>

      <div className="mt-10 flex flex-col gap-4">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">Step 1</p>
            <p className="mt-1 text-base font-medium text-(--dark-400)">Wallet</p>
          </div>
          {isConnected && address !== undefined ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-(--dark-400)">
              <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.5} className="text-(--purple-500)" />
              {address.slice(0, 6)}...{address.slice(-4)}
              <span className="text-(--dark-300)">Connected</span>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">Step 2</p>
              <p className="mt-1 text-base font-medium text-(--dark-400)">Name this secret</p>
            </div>
            {secretState === 'created' && (
              <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.5} className="text-(--purple-500)" />
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={secretName}
              onChange={(event) => {
                setSecretName(event.target.value);
                if (secretState === 'created') {
                  setSecretState('empty');
                }
              }}
              disabled={!isConnected || secretState === 'creating'}
              placeholder="openai-key"
              className="flex-1 rounded-full border border-(--dark-50) bg-white px-5 py-4 text-sm text-(--dark-400) placeholder:text-(--dark-100) focus:border-(--purple-500) focus:outline-none disabled:bg-(--dark-50)/30"
            />
            <Button
              variant="secondary"
              icon={LockKeyIcon}
              loading={secretState === 'creating'}
              loadingLabel="Creating..."
              disabled={!canCreateSecret}
              onClick={handleCreateSecret}
            >
              Create secret
            </Button>
          </div>

          {secretState === 'created' && (
            <p className="text-sm text-(--dark-300)">
              Secret created. Your agent can now request access to it.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        {canContinue ? (
          <Link
            href="/sandbox"
            className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
          >
            Continue
            <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
          </Link>
        ) : (
          <Button variant="primary" icon={ArrowRight02Icon} iconPosition="trailing" disabled>
            Continue
          </Button>
        )}
        <Link href="/sandbox" className="text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)">
          Open developer sandbox
        </Link>
      </div>
    </SplitScreenShell>
  );
}
