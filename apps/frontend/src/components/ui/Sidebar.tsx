'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { Pulse01Icon, Robot01Icon, ShareKnowledgeIcon, Wrench01Icon } from '@hugeicons/core-free-icons';

type NavItem = {
  href: string;
  icon: IconSvgElement;
  label: string;
};

const topNavItems: NavItem[] = [
  { href: '/agents', icon: Robot01Icon, label: 'Agents' },
  { href: '/activity', icon: Pulse01Icon, label: 'Activity' },
];

function RailButton({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      aria-current={isActive ? 'page' : undefined}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
        isActive ? 'bg-(--dark-500) text-white' : 'text-(--dark-400) hover:bg-(--dark-50)'
      }`}
    >
      <HugeiconsIcon icon={item.icon} size={20} strokeWidth={1.5} />
    </Link>
  );
}

/**
 * Full-height left column: logo + nav rail together, not a full-width header
 * with a floating rail underneath. Bottom-right icon's product meaning was
 * never specified by the team, so it's left inert rather than guessed —
 * wrench (Settings) is the one confirmed mapping.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col items-center gap-8 py-6 sm:flex">
      <Link
        href="/"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--dark-500)"
      >
        <img src="/veyra-mark.svg" alt="Veyra" className="h-6 w-6 object-contain" />
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col justify-between">
        <div className="flex flex-col gap-1 rounded-2xl border border-(--dark-50) p-1.5">
          {topNavItems.map((item) => (
            <RailButton key={item.href} item={item} isActive={pathname === item.href} />
          ))}
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-(--dark-50) p-1.5">
          <RailButton
            item={{ href: '/settings', icon: Wrench01Icon, label: 'Settings' }}
            isActive={pathname === '/settings'}
          />
          <button
            type="button"
            aria-label="More options, coming soon"
            title="Coming soon"
            disabled
            className="flex h-11 w-11 items-center justify-center rounded-xl text-(--dark-100)"
          >
            <HugeiconsIcon icon={ShareKnowledgeIcon} size={20} strokeWidth={1.5} />
          </button>
        </div>
      </nav>
    </aside>
  );
}
