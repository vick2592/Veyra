'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Card width — most decision modals want the narrower default. */
  size?: 'md' | 'lg';
};

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-xl',
};

/**
 * Shared shell for every modal in the app — dark backdrop, centered rounded
 * card, Escape-to-close. Reuse this for each new modal (Register Agent,
 * etc.) rather than re-rolling the backdrop/card pattern per screen.
 */
export function Modal({ open, onClose, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open || onClose === undefined) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose?.();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,8,19,0.55)] p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div className={`w-full ${sizeClasses[size]} rounded-[32px] bg-(--creame) p-10 shadow-[0_24px_80px_rgba(4,8,19,0.28)]`}>
        {children}
      </div>
    </div>
  );
}
