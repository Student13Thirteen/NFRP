'use client';

import type { ReactNode } from 'react';

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  message: string;
  title?: string;
};

export function ConfirmSubmitButton({ children, className, disabled, message, title }: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      disabled={disabled}
      title={title}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
