/**
 * There is no backend "cancel"/"deny" transition for a pending request (the
 * queue store only allows pending_human_auth -> executing) — a request you
 * walk away from just sits there until it expires (PENDING_REQUEST_TTL_MS,
 * 15 minutes by default). Without this, dismissing it in one place (e.g.
 * /agents' modal) didn't stop it from reappearing elsewhere (the top bar's
 * bell, the Dashboard) since each read the raw pending queue independently.
 * This is a shared, per-wallet, local suppression list so "dismissed" means
 * the same thing everywhere until the request actually expires.
 */
function storageKey(ownerAddress: string): string {
  return `veyra:dismissed-requests:${ownerAddress.toLowerCase()}`;
}

export function getDismissedRequestIds(ownerAddress: string): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey(ownerAddress));
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function dismissRequest(ownerAddress: string, requestId: string): string[] {
  const current = getDismissedRequestIds(ownerAddress);
  if (current.includes(requestId)) {
    return current;
  }
  const next = [...current, requestId];
  try {
    window.localStorage.setItem(storageKey(ownerAddress), JSON.stringify(next));
  } catch {
    // Best-effort — a blocked/private-mode store just won't persist the dismissal.
  }
  return next;
}
