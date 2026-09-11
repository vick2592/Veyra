import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar, type Tier } from './TopBar';

type DashboardShellProps = {
  title: string;
  tier?: Tier;
  pendingCount?: number;
  children: ReactNode;
};

export function DashboardShell({ title, tier, pendingCount, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-(--creame) px-6 py-6 sm:px-10">
      <TopBar title={title} tier={tier} pendingCount={pendingCount} />
      <Sidebar />
      <main className="mt-10 sm:pl-24">{children}</main>
    </div>
  );
}
