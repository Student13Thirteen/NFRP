'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ConfirmSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'type'> & {
  children: ReactNode;
  message: string;
};

export function ConfirmSubmitButton({ children, message, ...buttonProps }: ConfirmSubmitButtonProps) {
  return (
    <button
      {...buttonProps}
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
