import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { ArrowRight02Icon, FaceIdIcon, LockKeyIcon, SecuredNetworkIcon } from '@hugeicons/core-free-icons';

const techPartners = ['World ID', 'Base', 'Ledger', 'Bazantic'];

type Feature = {
  icon: IconSvgElement;
  title: string;
  body: string;
};

const features: Feature[] = [
  {
    icon: FaceIdIcon,
    title: 'A real human, every time',
    body: 'Face Auth proves a live person authorized this — not a bot, not a replayed session.',
  },
  {
    icon: LockKeyIcon,
    title: 'Never the raw key',
    body: 'Agents request access to a named secret. They never receive the value itself.',
  },
  {
    icon: SecuredNetworkIcon,
    title: 'Every decision, provable',
    body: 'Authorizations are recorded on-chain — tamper-evident, and checkable by anyone.',
  },
];

type Step = {
  title: string;
  body: string;
};

const steps: Step[] = [
  {
    title: 'Connect & scope',
    body: 'Connect your wallet and create a secret your agent can request — never hand it over directly.',
  },
  {
    title: 'Agent requests, you confirm',
    body: 'An agent asks for access. You approve with World ID, tied to that specific action.',
  },
  {
    title: 'Executed, recorded',
    body: 'Veyra executes the scoped request and logs it on-chain — nothing more than what you approved.',
  },
];

export default function LandingPage() {
  return (
    <main className="bg-(--creame)">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div style={{ width: 28, height: 24 }}>
            <img src="/veyra-mark.svg" alt="Veyra" className="h-full w-full object-contain" />
          </div>
          <span className="text-lg font-semibold text-(--dark-400)">Veyra</span>
        </Link>
        <Link
          href="/setup"
          className="inline-flex items-center justify-center rounded-full bg-(--purple-500) px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
        >
          Get started
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-6 sm:px-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <span className="inline-flex items-center rounded-full border border-(--dark-50) px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--dark-300)">
              Agent Capability Broker
            </span>
            <h1 className="mt-6 text-[44px] font-bold leading-[1.05] tracking-[-0.02em] text-(--blue-500) sm:text-[64px]">
              Agents act.
              <br />
              Humans approve.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-(--dark-300) sm:text-lg">
              Veyra gives AI agents scoped, revocable access to your secrets — while a real human
              approves every action with World ID, on-chain.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/setup"
                className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
              >
                Get started
                <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
              </Link>
              <a
                href="#how-it-works"
                className="text-sm font-semibold text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)"
              >
                See how it works
              </a>
            </div>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-[32px] bg-(--dark-500) lg:aspect-auto lg:h-[440px]">
            <img src="/hero-trust.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="border-t border-(--dark-50) py-10">
        <div className="mx-auto max-w-6xl px-6 sm:px-10">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-(--dark-300)">
            Built on real infrastructure
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {techPartners.map((partner) => (
              <span key={partner} className="text-sm font-semibold text-(--dark-300)">
                {partner}
              </span>
            ))}
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
            <h2 className="text-3xl font-bold text-(--blue-500) sm:text-4xl">Three steps, every time</h2>
            <p className="mt-4 text-base leading-7 text-(--dark-300)">
              The same scoped flow, whether it&apos;s the first request or the thousandth.
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

      <section className="px-6 py-20 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-[32px] bg-(--dark-500) px-8 py-16 text-center">
          <h2 className="max-w-lg text-3xl font-bold text-white sm:text-4xl">
            Give your agents a scoped key, not a raw one.
          </h2>
          <Link
            href="/setup"
            className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-(--purple-500) px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#6b4fe6]"
          >
            Get started
            <HugeiconsIcon icon={ArrowRight02Icon} size={18} strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-(--dark-50) py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:px-10">
          <div className="flex items-center gap-3">
            <div style={{ width: 24, height: 20 }}>
              <img src="/veyra-mark.svg" alt="Veyra" className="h-full w-full object-contain" />
            </div>
            <span className="text-sm font-semibold text-(--dark-400)">Veyra</span>
          </div>
          <p className="text-xs text-(--dark-300)">Scoped access for AI agents.</p>
          <Link href="/sandbox" className="text-xs text-(--dark-300) underline underline-offset-4 hover:text-(--dark-400)">
            Open developer sandbox
          </Link>
        </div>
      </footer>
    </main>
  );
}
