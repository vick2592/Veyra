'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Shared shell for slide-in panels (Agent Detail today, more later) — dark
 * backdrop, panel anchored to the right edge, Escape-to-close. Sibling to
 * Modal.tsx: same reuse intent, different surface type per each page's own
 * spec (see veyra-surface-types memory).
 */
export function Drawer({ open, onClose, children }: DrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="animate-veyra-fade-in fixed inset-0 z-50 flex justify-end bg-[rgba(4,8,19,0.55)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="animate-veyra-slide-in-right h-full w-full max-w-md overflow-y-auto bg-(--creame) p-8 shadow-[0_24px_80px_rgba(4,8,19,0.28)]">
        {children}
      </div>
    </div>
  );
}
