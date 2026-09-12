'use client';

import Link from 'next/link';
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
};

const steps: ChainStep[] = [
  { label: 'Wallet', icon: Wallet01Icon },
  { label: 'Hardware key slot', icon: CpuIcon },
  { label: 'On-chain secret', icon: LockKeyIcon },
  { label: 'World ID authorization', icon: IdVerifiedIcon },
  { label: 'Agent execution', icon: Robot01Icon },
];

/**
 * Static map of the real pipeline, not per-session progress — the old
 * complete/incomplete flags were local useState that reset on navigation,
 * so they could never honestly answer "did this actually happen." Full
 * mechanics live at /architecture; this is the hub's short pointer to it.
 */
export function TrustChainVisualizer() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">How Veyra works</p>
        <Link href="/architecture" className="flex items-center gap-1 text-xs font-semibold text-(--purple-500)">
          Full architecture
          <HugeiconsIcon icon={ArrowRight02Icon} size={12} strokeWidth={2} />
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-full border border-(--dark-50) px-4 py-2 text-xs font-semibold text-(--dark-300)">
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
