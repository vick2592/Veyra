'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { Blockchain01Icon, IdVerifiedIcon, LockKeyIcon, Tick02Icon, Wallet01Icon } from '@hugeicons/core-free-icons';

export type TransactionStep = 'encrypting' | 'proving' | 'wallet' | 'mining' | 'success';

const STEP_COPY: Record<TransactionStep, { icon: IconSvgElement; label: string }> = {
  encrypting: { icon: LockKeyIcon, label: 'Encrypting via Hardware Enclave...' },
  proving: { icon: IdVerifiedIcon, label: 'Generating World ID Zero-Knowledge Proof...' },
  wallet: { icon: Wallet01Icon, label: 'Please approve the transaction in your wallet...' },
  mining: { icon: Blockchain01Icon, label: 'Confirming on Base Sepolia... (waiting for block)' },
  success: { icon: Tick02Icon, label: 'Success! Secured on-chain.' },
};

/**
 * Shared step tracker for any flow that encrypts and/or proves before a
 * chain write. `steps` is the subset this particular flow goes through, in
 * order — Add Secret skips `proving` entirely since it has no World ID leg.
 */
export function TransactionStatus({ steps, active }: { steps: TransactionStep[]; active: TransactionStep | null }) {
  if (active === null) {
    return null;
  }
  const activeIndex = steps.indexOf(active);

  return (
    <div className="animate-veyra-fade-in flex flex-col gap-3 rounded-2xl border border-(--dark-50) bg-(--creame) p-4">
      {steps.map((step, index) => {
        const isComplete = active === 'success' || (activeIndex !== -1 && index < activeIndex);
        const isActive = step === active;
        const { icon, label } = STEP_COPY[step];
        return (
          <div key={step} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                isComplete
                  ? 'bg-(--purple-500) text-white'
                  : isActive
                    ? 'border-2 border-(--purple-500) text-(--purple-500)'
                    : 'border border-(--dark-50) text-(--dark-100)'
              }`}
            >
              {isComplete ? (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
              ) : isActive ? (
                <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <HugeiconsIcon icon={icon} size={14} strokeWidth={1.5} />
              )}
            </span>
            <p
              className={`text-sm ${
                isActive ? 'font-semibold text-(--dark-400)' : isComplete ? 'text-(--dark-300)' : 'text-(--dark-100)'
              }`}
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
