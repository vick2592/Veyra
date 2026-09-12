'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  ArrowRight02Icon,
  CpuIcon,
  IdVerifiedIcon,
  LockKeyIcon,
  Robot01Icon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';

type ChainStep = {
  label: string;
  icon: IconSvgElement;
  complete: boolean;
};

export function TrustChainVisualizer({
  leafIndex,
  secretStored,
  worldIdVerified,
  agentExecuted,
}: {
  leafIndex: number;
  secretStored: boolean;
  worldIdVerified: boolean;
  agentExecuted: boolean;
}) {
  const steps: ChainStep[] = [
    { label: 'User Wallet', icon: Wallet01Icon, complete: true },
    { label: `BIP-32 Hardware Slot (veyra-user-${leafIndex})`, icon: CpuIcon, complete: true },
    { label: 'On-Chain Ciphertext (Base Sepolia)', icon: LockKeyIcon, complete: secretStored },
    { label: 'World ID Authorization', icon: IdVerifiedIcon, complete: worldIdVerified },
    { label: 'Target Agent Execution', icon: Robot01Icon, complete: agentExecuted },
  ];

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">Hardware trust chain</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                step.complete
                  ? 'border-(--purple-500) bg-(--purple-500)/10 text-(--purple-500)'
                  : 'border-(--dark-50) text-(--dark-300)'
              }`}
            >
              <HugeiconsIcon icon={step.icon} size={14} strokeWidth={1.5} />
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={1.5} className="shrink-0 text-(--dark-100)" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
