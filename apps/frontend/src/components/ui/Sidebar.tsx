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
 * Floating icon-only rail, fixed to the viewport — matches the built Figma
 * shell, not Page 12's copy-spec text (single "Settings" item, labels shown).
 * Real frame: two pill groups, icon-only. Bottom-right icon's product
 * meaning was never specified by the team, so it's left inert for now
 * rather than guessed — wrench (Settings) is the one confirmed mapping.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-8 left-8 top-28 z-40 hidden flex-col justify-between sm:flex"
    >
      <div className="flex flex-col gap-1 rounded-2xl border border-(--dark-50) bg-white p-1.5">
        {topNavItems.map((item) => (
          <RailButton key={item.href} item={item} isActive={pathname === item.href} />
        ))}
      </div>

      <div className="flex flex-col gap-1 rounded-2xl border border-(--dark-50) bg-white p-1.5">
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
  );
}
