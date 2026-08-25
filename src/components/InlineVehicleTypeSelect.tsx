'use client';

import { useId, useState, useTransition } from 'react';
import { Check, CircleAlert, Loader2 } from 'lucide-react';

type Option = { value: string; label: string };

type InlineVehicleTypeSelectProps = {
  /** Salvataggio del solo campo tipologia: deve restare un'azione breve. */
  save: (value: string) => Promise<void>;
  options: Option[];
  defaultValue: string;
  label: string;
  emptyLabel?: string;
};

/**
 * Tendina che salva da sola, pensata per classificare una flotta intera senza
 * aprire una scheda per volta. Mantiene il valore scelto anche mentre il
 * salvataggio e in corso, cosi la riga non "torna indietro" sotto le mani.
 */
export function InlineVehicleTypeSelect({
  save,
  options,
  defaultValue,
  label,
  emptyLabel = 'Da classificare'
}: InlineVehicleTypeSelectProps) {
  const fieldId = useId();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');

  function commit(nextValue: string) {
    const previous = value;
    setValue(nextValue);
    setState('idle');
    startTransition(async () => {
      try {
        await save(nextValue);
        setState('saved');
        window.setTimeout(() => setState('idle'), 2500);
      } catch {
        // Il valore torna a quello reale: meglio mostrare il dato vero che una
        // classificazione che l'operatore crede salvata e non lo e.
        setValue(previous);
        setState('error');
      }
    });
  }

  return (
    <span className="inline-type-select">
      <label className="screen-reader-only" htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        value={value}
        disabled={pending}
        onChange={(event) => commit(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className={`inline-type-state${state === 'error' ? ' has-error' : ''}`} aria-live="polite">
        {pending ? (
          <><Loader2 size={14} aria-hidden className="spin" /><span className="screen-reader-only">Salvataggio in corso</span></>
        ) : state === 'saved' ? (
          <><Check size={14} aria-hidden /><span className="screen-reader-only">Salvato</span></>
        ) : state === 'error' ? (
          <><CircleAlert size={14} aria-hidden /> Non salvato</>
        ) : null}
      </span>
    </span>
  );
}
