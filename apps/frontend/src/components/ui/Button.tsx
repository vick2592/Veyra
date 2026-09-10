'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: IconSvgElement;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-(--purple-500) text-white hover:bg-[#6b4fe6] disabled:bg-(--dark-50) disabled:text-(--dark-100)',
  secondary:
    'border border-(--dark-50) text-(--dark-400) hover:bg-(--dark-50)/40 disabled:text-(--dark-100) disabled:border-(--dark-50)',
};

export function Button({
  variant = 'primary',
  icon,
  iconPosition = 'leading',
  loading = false,
  loadingLabel,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`inline-flex min-w-56 items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold transition disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon !== undefined && iconPosition === 'leading' && (
          <HugeiconsIcon icon={icon} size={18} strokeWidth={1.5} />
        )
      )}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
      {!loading && icon !== undefined && iconPosition === 'trailing' && (
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.5} />
      )}
    </button>
  );
}
