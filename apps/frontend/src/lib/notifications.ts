/**
 * Real browser desktop notifications (Notification API), not a mock toggle.
 * The on/off preference is a per-viewer UI convenience, so localStorage is
 * the right store for it — nothing here needs to be shared or read back by
 * the server.
 */
const STORAGE_KEY = 'veyra:desktop-notifications';

export function getNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Best-effort — a blocked/private-mode store just won't persist the toggle.
  }
}

export function isNotificationPermissionDenied(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied';
}

/** Fires only if the viewer has opted in AND already granted browser permission. */
export function sendApprovalNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }
  if (!getNotificationsEnabled() || Notification.permission !== 'granted') {
    return;
  }
  try {
    new Notification(title, { body });
  } catch {
    // Best-effort — some browsers restrict this from certain contexts.
  }
}
