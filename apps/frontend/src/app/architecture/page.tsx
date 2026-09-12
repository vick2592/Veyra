import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { Coins01Icon, FaceIdIcon, LockKeyIcon, SecuredNetworkIcon } from '@hugeicons/core-free-icons';
import { Card } from '@/components/ui/Card';

type ArchitectureBlock = {
  icon: IconSvgElement;
  title: string;
  tagline: string;
  body: string;
};

const blocks: ArchitectureBlock[] = [
  {
    icon: FaceIdIcon,
    title: 'World ID',
    tagline: 'A real, present human — every time.',
    body: 'Face Auth proves a live person authorized this, not a bot or a replayed session.',
  },
  {
    icon: LockKeyIcon,
    title: 'Ledger Key Ring',
    tagline: 'Your key never touches app storage.',
    body: 'Secrets are decrypted in memory, for a fraction of a second, only after approval — then discarded.',
  },
  {
    icon: Coins01Icon,
    title: 'Bazantic',
    tagline: 'Agents pay before they can even ask.',
    body: 'x402 micropayments mean spam and abuse cost the agent money, not you.',
  },
  {
    icon: SecuredNetworkIcon,
    title: 'On-chain audit trail',
    tagline: 'Every decision is recorded, tamper-evident.',
    body: 'An on-chain log means what happened can be checked, not just claimed.',
  },
];

export default function ArchitecturePage() {
  return (
    <main className="min-h-screen bg-(--creame) px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <div style={{ width: 28, height: 24 }}>
            <img src="/veyra-mark-dark.svg" alt="Veyra" className="h-full w-full object-contain" />
          </div>
          <span className="text-lg font-semibold text-(--dark-400)">Veyra</span>
        </div>

        <h1 className="mt-14 text-center text-4xl font-bold leading-tight text-(--blue-500) sm:text-5xl">
          How Veyra actually keeps this secure.
        </h1>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {blocks.map((block) => (
            <Card key={block.title} className="flex flex-col gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--dark-500) text-white">
                <HugeiconsIcon icon={block.icon} size={18} strokeWidth={1.5} />
              </span>
              <p className="font-semibold text-(--dark-400)">{block.title}</p>
              <p className="text-sm font-semibold text-(--dark-400)">{block.tagline}</p>
              <p className="text-sm leading-6 text-(--dark-300)">{block.body}</p>
            </Card>
          ))}
        </div>

        <p className="mt-12 text-center text-sm font-semibold text-(--dark-300)">
          No raw key ever leaves Veyra — not once, not to anyone.
        </p>

        <div className="mt-10 flex justify-center">
          <Link
            href="/agents"
            className="inline-flex min-w-56 items-center justify-center rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
          >
            Back to agents
          </Link>
        </div>
      </div>
    </main>
  );
}
