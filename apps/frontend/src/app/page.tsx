import Image from 'next/image';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { FaceIdIcon, LockKeyIcon, SecuredNetworkIcon } from '@hugeicons/core-free-icons';
import { FlowingLines } from '@/components/landing/FlowingLines';
import { GetStartedButton } from '@/components/landing/GetStartedButton';
import { TeamSection } from '@/components/landing/TeamSection';

type Partner = {
  name: string;
  logo: string;
  width: number;
  height: number;
  /** Bazantic's mark is a light cream, invisible on this page's light bg —
   * needs a dark tile behind it. The others are black-on-transparent. */
  darkBg?: boolean;
};

const techPartners: Partner[] = [
  { name: 'World ID', logo: '/partners/world.png', width: 784, height: 214 },
  { name: 'Base', logo: '/partners/base.png', width: 800, height: 202 },
  { name: 'Ledger', logo: '/partners/ledger.png', width: 1407, height: 498 },
  { name: 'Bazantic', logo: '/partners/bazantic.png', width: 1670, height: 772, darkBg: true },
];

type Feature = {
  icon: IconSvgElement;
  title: string;
  body: string;
};

const features: Feature[] = [
  {
    icon: FaceIdIcon,
    title: 'Real humans, no bots',
    body: 'World ID Face Auth proves a living, breathing person authorized the action, preventing automated Sybil attacks.',
  },
  {
    icon: LockKeyIcon,
    title: 'Locked in physical hardware',
    body: 'Your API keys are encrypted directly into a Ledger hardware enclave. Agents get the capability, never the raw credential.',
  },
  {
    icon: SecuredNetworkIcon,
    title: 'Agents pay to access',
    body: 'Integrated with Bazantic x402 gateways, cloud agents pay micro-tolls just to request access, eliminating spam.',
  },
];

type Step = {
  title: string;
  body: string;
};

const steps: Step[] = [
  {
    title: 'Hardware-Secured Custody',
    body: 'Connect your wallet and lock your sensitive API keys into a hardware-derived Ledger slot. Raw keys are never exposed to the internet.',
  },
  {
    title: 'Agent Connection & Spam Prevention',
    body: 'Veyra utilizes the Bazantic gateway to seamlessly connect with cloud agents, collecting micro-payments to prevent spam and monetize secure storage.',
  },
  {
    title: 'Sybil-Protected Approvals',
    body: 'Approve execution with a quick World ID Face Auth scan, ensuring a verified human—not a bot or replay attack—authorizes every single action.',
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate bg-(--creame)">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <FlowingLines />
      </div>

      <div className="relative flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
          <Link href="/" className="flex items-center gap-3">
            <div style={{ width: 28, height: 24 }}>
              <img src="/veyra-mark-dark.svg" alt="Veyra" className="h-full w-full object-contain" />
            </div>
            <span className="text-lg font-semibold text-(--dark-400)">Veyra</span>
          </Link>
          <GetStartedButton size="sm" />
        </header>

        <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-16 sm:px-10 lg:pb-28">
          <div className="grid w-full gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <span className="inline-flex items-center rounded-full border border-(--dark-50) px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
                Agent Capability Broker
              </span>
              <h1 className="mt-6 text-[44px] font-bold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[64px]">
                Agents do the heavy lifting.
                <br />
                You hold the keys.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-(--dark-300) sm:text-lg">
                Veyra lets autonomous AI agents pay micro-tolls to execute tasks, while your API
                keys stay locked in a physical hardware vault. No raw keys exposed. Just secure,
                human-approved execution.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <GetStartedButton size="lg" />
                <a
                  href="#how-it-works"
                  className="text-sm font-semibold text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
                >
                  See how it works
                </a>
              </div>
            </div>

            <div className="relative aspect-square overflow-hidden rounded-[32px] bg-(--dark-500) lg:aspect-auto lg:h-[480px]">
              <Image
                src="/hero-trust.png"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>
      </div>

      <section className="border-t border-(--dark-50) py-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">
            Built on real infrastructure
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {techPartners.map((partner) =>
              partner.darkBg === true ? (
                <span key={partner.name} className="flex h-10 items-center rounded-xl bg-(--dark-500) px-4">
                  <Image src={partner.logo} alt={partner.name} width={partner.width} height={partner.height} className="h-4 w-auto" />
                </span>
              ) : (
                <Image
                  key={partner.name}
                  src={partner.logo}
                  alt={partner.name}
                  width={partner.width}
                  height={partner.height}
                  className="h-6 w-auto opacity-70 sm:h-7"
                />
              ),
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-(--blue-500) sm:text-4xl">Nothing more than what&apos;s needed</h2>
          <p className="mt-4 text-base leading-7 text-(--dark-300)">
            Every request is scoped to one action, confirmed by a human, and revocable at any time.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-3xl border border-(--dark-50) bg-white p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--dark-500) text-white">
                <HugeiconsIcon icon={feature.icon} size={20} strokeWidth={1.5} />
              </span>
              <p className="mt-5 font-semibold text-(--dark-400)">{feature.title}</p>
              <p className="mt-2 text-sm leading-6 text-(--dark-300)">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-(--dark-50) bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-(--blue-500) sm:text-4xl">Three pillars of trust</h2>
            <p className="mt-4 text-base leading-7 text-(--dark-300)">
              A unified architecture combining hardware custody, AI monetization, and sybil-resistant identity.
            </p>
          </div>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--purple-500) text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="mt-4 font-semibold text-(--dark-400)">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-(--dark-300)">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TeamSection />

      <section className="px-6 py-20 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-[32px] bg-(--dark-500) px-8 py-16 text-center">
          <h2 className="max-w-lg text-3xl font-bold text-white sm:text-4xl">
            Give your AI agents capabilities, not credentials.
          </h2>
          <GetStartedButton size="lg" />
        </div>
      </section>

      <footer className="border-t border-(--dark-50) py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <div className="flex items-center gap-3">
            <div style={{ width: 24, height: 20 }}>
              <img src="/veyra-mark-dark.svg" alt="Veyra" className="h-full w-full object-contain" />
            </div>
            <span className="text-sm font-semibold text-(--dark-400)">Veyra</span>
          </div>
          <p className="text-xs text-(--dark-300)">Scoped access for AI agents.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/vick2592/Veyra"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
            >
              GitHub
            </a>
            <Link href="/sandbox" className="text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)">
              Open developer sandbox
            </Link>
          </div>
          <p className="text-xs text-(--dark-300)">© 2026 Veyra. Built for ETHOnline 2026.</p>
        </div>
      </footer>
    </main>
  );
}
