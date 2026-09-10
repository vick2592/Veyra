import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between rounded-4xl border border-(--line) bg-[rgba(255,253,246,0.66)] p-6 shadow-[0_24px_80px_rgba(23,33,27,0.12)] backdrop-blur sm:min-h-[calc(100vh-5rem)] sm:p-10">
        <header className="flex items-center justify-between border-b border-(--line) pb-5">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em]">
            <span className="h-3 w-3 rounded-full bg-(--lime) ring-4 ring-[rgba(217,242,106,0.28)]" />
            Veyra
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-(--muted)">Human gate / 01</span>
        </header>

        <section className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-(--muted)">Agent capability broker</p>
            <h1 className="max-w-3xl text-5xl leading-[0.96] tracking-[-0.03em] sm:text-7xl">
              Give the agent a green light.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-(--muted) sm:text-xl">
              Veyra keeps human approval in the loop before a narrowly scoped capability reaches an agent.
            </p>
          </div>

          <div className="border-l border-(--line) pl-6 lg:mb-1">
            <p className="text-sm leading-6 text-(--muted)">
              Face Auth and the local request simulator live in the developer sandbox.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6 border-t border-(--line) pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-6 text-(--muted)">
            Open the sandbox to create a request, capture World ID proof, and authorize the agent on-chain.
          </p>
          <Link
            href="/sandbox"
            className="inline-flex min-w-56 items-center justify-center rounded-full bg-(--ink) px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2a3a2f]"
          >
            Open Sandbox
          </Link>
        </section>
      </div>
    </main>
  );
}
