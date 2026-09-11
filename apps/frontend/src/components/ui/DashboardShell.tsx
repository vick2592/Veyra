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
    <div className="flex min-h-screen bg-(--creame)">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar title={title} tier={tier} pendingCount={pendingCount} />
        <main className="flex-1 px-6 py-6 sm:px-10">{children}</main>
      </div>
    </div>
  );
}
