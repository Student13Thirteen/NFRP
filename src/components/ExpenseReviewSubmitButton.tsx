'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

type ExpenseReviewSubmitButtonProps = {
  label: string;
};

/**
 * Mantiene invariata l'azione di conferma, ma rende evidente il primo invio e
 * impedisce di inviare di nuovo lo stesso documento mentre il server lavora.
 */
export function ExpenseReviewSubmitButton({ label }: ExpenseReviewSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button expense-review-submit" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 size={16} aria-hidden className="spin" /> : <CheckCircle2 size={16} aria-hidden />}
      {pending ? 'Validazione in corso…' : label}
    </button>
  );
}
