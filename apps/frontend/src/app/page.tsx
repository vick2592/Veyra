import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { ArrowRight02Icon, FaceIdIcon, LockKeyIcon, SecuredNetworkIcon } from '@hugeicons/core-free-icons';
import { SplitScreenShell } from '@/components/ui/SplitScreenShell';

type Highlight = {
  icon: IconSvgElement;
  title: string;
  body: string;
};

const highlights: Highlight[] = [
  {
    icon: FaceIdIcon,
    title: 'World ID',
    body: 'A real, present human approves every action — not a bot, not a replayed session.',
  },
  {
    icon: LockKeyIcon,
    title: 'Scoped secrets',
    body: 'Agents request access to a secret. They never receive the raw key itself.',
  },
  {
    icon: SecuredNetworkIcon,
    title: 'On-chain record',
    body: 'Every authorization is recorded, tamper-evident, and checkable by anyone.',
  },
];

export default function LandingPage() {
  return (
    <SplitScreenShell>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-(--dark-300)">Veyra</p>
      <h1 className="mt-4 max-w-xl text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[52px]">
        Let agents act, without ever holding your keys.
      </h1>
      <p className="mt-5 max-w-md text-base leading-7 text-(--dark-300)">
        Veyra proves a real human authorized every agent action, with World ID and a scoped, revocable
        secret — never a raw API key.
      </p>

      <Link
        href="/setup"
        className="mt-8 inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
      >
        Get started
        <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
      </Link>

      <div className="mt-14 flex flex-col gap-6 border-t border-(--dark-50) pt-8">
        {highlights.map((highlight) => (
          <div key={highlight.title} className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
              <HugeiconsIcon icon={highlight.icon} size={18} strokeWidth={1.5} />
            </span>
            <div>
              <p className="font-semibold text-(--dark-400)">{highlight.title}</p>
              <p className="mt-1 text-sm leading-6 text-(--dark-300)">{highlight.body}</p>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/sandbox"
        className="mt-10 inline-block text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
      >
        Open developer sandbox
      </Link>
    </SplitScreenShell>
  );
}
