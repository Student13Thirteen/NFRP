'use client';

import { useId, useState, useTransition } from 'react';
import { Check, CircleAlert, Loader2 } from 'lucide-react';

type Option = { value: string; label: string };

type InlineTrailerTypeSelectProps = {
  save: (bodyValue: string, cargoValue: string) => Promise<void>;
  bodyOptions: Option[];
  cargoOptions: Option[];
  /** Valore dell'allestimento cisterna, per mostrare il carico solo quando serve. */
  tankValue: string;
  defaultBodyType: string;
  defaultTankCargo: string;
  plate: string;
};

/**
 * Allestimento e carico cisterna sulla stessa riga: il carico compare solo per
 * le cisterne e viene azzerato dal server quando l'allestimento cambia, cosi un
 * container non conserva un residuo "GPL".
 */
export function InlineTrailerTypeSelect({
  save,
  bodyOptions,
  cargoOptions,
  tankValue,
  defaultBodyType,
  defaultTankCargo,
  plate
}: InlineTrailerTypeSelectProps) {
  const bodyId = useId();
  const cargoId = useId();
  const [bodyType, setBodyType] = useState(defaultBodyType);
  const [tankCargo, setTankCargo] = useState(defaultTankCargo);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');

  function commit(nextBody: string, nextCargo: string) {
    const previousBody = bodyType;
    const previousCargo = tankCargo;
    const cargo = nextBody === tankValue ? nextCargo : '';
    setBodyType(nextBody);
    setTankCargo(cargo);
    setState('idle');
    startTransition(async () => {
      try {
        await save(nextBody, cargo);
        setState('saved');
        window.setTimeout(() => setState('idle'), 2500);
      } catch {
        setBodyType(previousBody);
        setTankCargo(previousCargo);
        setState('error');
      }
    });
  }

  return (
    <span className="inline-type-select inline-type-select-trailer">
      <label className="screen-reader-only" htmlFor={bodyId}>{`Allestimento del semirimorchio ${plate}`}</label>
      <select id={bodyId} value={bodyType} disabled={pending} onChange={(event) => commit(event.target.value, tankCargo)}>
        <option value="">Da classificare</option>
        {bodyOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {bodyType === tankValue ? (
        <>
          <label className="screen-reader-only" htmlFor={cargoId}>{`Carico della cisterna ${plate}`}</label>
          <select id={cargoId} value={tankCargo} disabled={pending} onChange={(event) => commit(bodyType, event.target.value)}>
            <option value="">Carico da precisare</option>
            {cargoOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </>
      ) : null}
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
