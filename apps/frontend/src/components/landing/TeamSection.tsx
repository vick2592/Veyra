import Image from 'next/image';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon } from '@hugeicons/core-free-icons';

type TeamMember = {
  name: string;
  role: string;
  photo: string;
  /** GitHub handle, where known — omitted rather than guessed. */
  github?: string;
};

const team: TeamMember[] = [
  { name: 'Comfort', role: 'Frontend · Design · Demo', photo: '/team-comfort.jpeg' },
  { name: 'Viktor', role: 'World ID · Ledger · Graph', photo: '/team-victor.png', github: 'vick2592' },
  { name: 'Sivaji', role: 'Backend · Contracts', photo: '/team-sivaji.jpg' },
];

export function TeamSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-(--blue-500) sm:text-4xl">Built by three people</h2>
        <p className="mt-4 text-base leading-7 text-(--dark-300)">One weekend, one hackathon, one demo.</p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {team.map((member) => (
          <div key={member.name} className="overflow-hidden rounded-3xl border border-(--dark-50) bg-white">
            <div className="relative aspect-[4/5] w-full">
              <Image
                src={member.photo}
                alt={member.name}
                fill
                loading="lazy"
                sizes="(min-width: 640px) 33vw, 100vw"
                className="object-cover object-top"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent"
              />
              <p className="absolute bottom-4 left-5 text-lg font-semibold text-white">{member.name}</p>
            </div>
            <div className="flex items-center justify-between gap-3 p-5">
              <p className="text-sm text-(--dark-300)">{member.role}</p>
              {member.github !== undefined && (
                <a
                  href={`https://github.com/${member.github}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${member.name} on GitHub`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-(--dark-300) transition hover:bg-(--dark-50) hover:text-(--dark-400)"
                >
                  <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={1.5} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
