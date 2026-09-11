export type AgentStatus = 'active' | 'revoked';

export function StatusPill({ status }: { status: AgentStatus }) {
  return status === 'active' ? (
    <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#15803D]">Active</span>
  ) : (
    <span className="rounded-full bg-(--dark-50) px-3 py-1 text-xs font-semibold text-(--dark-300)">Revoked</span>
  );
}
