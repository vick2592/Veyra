'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import { FaceIdIcon, Key01Icon, Notification03Icon } from '@hugeicons/core-free-icons';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { Card } from '@/components/ui/Card';
import {
  getNotificationsEnabled,
  isNotificationPermissionDenied,
  setNotificationsEnabled,
} from '@/lib/notifications';

function SettingsRow({
  icon,
  title,
  children,
}: {
  icon: IconSvgElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--dark-500) text-white">
          <HugeiconsIcon icon={icon} size={18} strokeWidth={1.5} />
        </span>
        <p className="font-semibold text-(--dark-400)">{title}</p>
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    setNotificationsOn(getNotificationsEnabled());
    setPermissionDenied(isNotificationPermissionDenied());
  }, []);

  async function handleToggleNotifications() {
    if (notificationsOn) {
      setNotificationsEnabled(false);
      setNotificationsOn(false);
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      setNotificationsOn(true);
      setPermissionDenied(false);
    } else {
      setPermissionDenied(permission === 'denied');
    }
  }

  return (
    <DashboardShell title="Settings">
      <h2 className="text-4xl font-bold text-(--blue-500) sm:text-5xl">Settings</h2>

      <div className="mt-8 flex flex-col gap-4">
        <SettingsRow icon={FaceIdIcon} title="World ID">
          <div className="flex items-center gap-3">
            <p className="text-sm text-(--dark-300)">
              Not tracked between sessions — World ID verification happens per action, at confirmation, not stored.
            </p>
            <button
              type="button"
              disabled
              title="Re-verify lives on the Agent Execution Gate, which isn't part of this build."
              className="shrink-0 rounded-full bg-(--dark-500)/40 px-4 py-2 text-xs font-semibold text-white cursor-not-allowed"
            >
              Re-verify
            </button>
          </div>
        </SettingsRow>

        <SettingsRow icon={Key01Icon} title="Ledger Key Ring">
          <div className="flex items-center gap-3">
            <p className="text-sm text-(--dark-300)">
              No Ledger is wired into this build — secrets run on the hardware-free fallback driver instead.
            </p>
            <button
              type="button"
              disabled
              title="No Key Ring identifier exists without real Ledger hardware attached."
              className="shrink-0 rounded-full bg-(--dark-500)/40 px-4 py-2 text-xs font-semibold text-white cursor-not-allowed"
            >
              Change identifier
            </button>
          </div>
        </SettingsRow>

        <SettingsRow icon={Notification03Icon} title="Desktop notifications">
          <div className="flex items-center gap-3">
            <p className="max-w-xs text-sm text-(--dark-300)">
              {permissionDenied
                ? 'Notifications are blocked in your browser settings.'
                : 'Get notified on this device when an agent needs your approval.'}
            </p>
            <button
              type="button"
              onClick={() => void handleToggleNotifications()}
              aria-pressed={notificationsOn}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                notificationsOn ? 'bg-(--purple-500)' : 'bg-(--dark-50)'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                  notificationsOn ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        </SettingsRow>
      </div>
    </DashboardShell>
  );
}
