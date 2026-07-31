'use client';

import type { VehicleLifecycleStatus } from '@prisma/client';
import { Loader2, Save } from 'lucide-react';
import { useFormStatus } from 'react-dom';

type VehicleLifecycleSubmitButtonProps = {
  currentStatus: VehicleLifecycleStatus;
};

export function VehicleLifecycleSubmitButton({ currentStatus }: VehicleLifecycleSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="primary-button"
      disabled={pending}
      type="submit"
      onClick={(event) => {
        const form = event.currentTarget.form;
        const statusField = form?.elements.namedItem('lifecycleStatus');
        const nextStatus = statusField instanceof HTMLSelectElement ? statusField.value : currentStatus;
        const isNewDisposal =
          nextStatus !== currentStatus && (nextStatus === 'SOLD' || nextStatus === 'SCRAPPED');

        if (
          isNewDisposal &&
          !window.confirm(
            'Confermare l\'uscita dalla flotta? I documenti del mezzo verranno archiviati e spostati nella sezione dedicata, senza eliminare alcun dato.'
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      {pending ? <Loader2 size={16} aria-hidden className="spin" /> : <Save size={16} aria-hidden />}
      {pending ? 'Salvataggio…' : 'Salva'}
    </button>
  );
}
