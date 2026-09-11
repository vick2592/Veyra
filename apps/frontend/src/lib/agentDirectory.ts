/**
 * There is no on-chain agent-registration mechanism (see lib/demoNarrative.ts)
 * — any address can already call the Bazantic API. So this is exactly what
 * it looks like: a personal address book, stored per connected wallet in
 * localStorage. It does not grant the agent anything, and it does not stop
 * any other address from still requesting access. It just lets a user keep
 * a real, working list of agents they recognize.
 */
export type RegisteredAgent = {
  address: string;
  label: string;
  addedAt: string;
};

function storageKey(ownerAddress: string): string {
  return `veyra:agents:${ownerAddress.toLowerCase()}`;
}

export function getRegisteredAgents(ownerAddress: string): RegisteredAgent[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey(ownerAddress));
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RegisteredAgent[]) : [];
  } catch {
    return [];
  }
}

export function addRegisteredAgent(ownerAddress: string, agent: { address: string; label: string }): RegisteredAgent[] {
  const current = getRegisteredAgents(ownerAddress);
  const next = [
    ...current.filter((existing) => existing.address.toLowerCase() !== agent.address.toLowerCase()),
    { address: agent.address, label: agent.label, addedAt: new Date().toISOString() },
  ];
  try {
    window.localStorage.setItem(storageKey(ownerAddress), JSON.stringify(next));
  } catch {
    // Best-effort — a blocked/private-mode store just won't persist the addition.
  }
  return next;
}

export function removeRegisteredAgent(ownerAddress: string, agentAddress: string): RegisteredAgent[] {
  const next = getRegisteredAgents(ownerAddress).filter(
    (existing) => existing.address.toLowerCase() !== agentAddress.toLowerCase(),
  );
  try {
    window.localStorage.setItem(storageKey(ownerAddress), JSON.stringify(next));
  } catch {
    // Best-effort.
  }
  return next;
}
