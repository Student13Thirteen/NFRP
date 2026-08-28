'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FORM_DRAFT_RESTORE_EVENT, formDraftFromEvent } from '@/lib/form-draft';
import {
  GUIDED_CHOICE_CUSTOM_VALUE,
  guidedChoiceInitialState,
  resolveGuidedChoice
} from '@/lib/guided-choice';

type Props = {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
  emptyLabel?: string;
  customLabel?: string;
  customPlaceholder?: string;
  help?: string;
  className?: string;
  // Posizione del campo tra quelli con lo stesso nome: serve alle righe ripetute
  // (container, tappe) per riprendere il valore giusto dopo un errore di salvataggio.
  restoreIndex?: number;
};

export function GuidedChoiceField({
  label,
  name,
  options,
  defaultValue,
  emptyLabel = 'Non indicato',
  customLabel = 'Altro: scrivi il valore',
  customPlaceholder = 'Scrivi il valore esatto',
  help,
  className,
  restoreIndex = 0
}: Props) {
  const customInputId = useId();
  const rootRef = useRef<HTMLLabelElement>(null);
  const [state, setState] = useState(() => guidedChoiceInitialState(defaultValue, options));

  // Le righe ripetute vengono ricostruite dal componente padre dopo un ripristino:
  // quando cambia il valore proposto, la tendina deve seguirlo.
  const lastDefault = useRef(defaultValue);
  useEffect(() => {
    if (lastDefault.current === defaultValue) return;
    lastDefault.current = defaultValue;
    setState(guidedChoiceInitialState(defaultValue, options));
  }, [defaultValue, options]);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form) return;

    const restore = (event: Event) => {
      const draft = formDraftFromEvent(event);
      const recovered = draft?.values[name]?.[restoreIndex];
      if (recovered === undefined) return;
      lastDefault.current = recovered;
      setState(guidedChoiceInitialState(recovered, options));
    };

    form.addEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
    return () => form.removeEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
  }, [name, options, restoreIndex]);

  const isCustom = state.selection === GUIDED_CHOICE_CUSTOM_VALUE;
  // Un valore gia salvato ma non presente in elenco riapre il campo libero con il suo
  // contenuto, altrimenti riaprire un viaggio storico lo cancellerebbe in silenzio.
  const resolved = resolveGuidedChoice(state);

  return (
    <label className={className} ref={rootRef}>
      {label}
      <select
        value={state.selection}
        onChange={(event) => setState((current) => ({ ...current, selection: event.target.value }))}
        aria-describedby={isCustom ? customInputId : undefined}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option value={option} key={option}>{option}</option>)}
        <option value={GUIDED_CHOICE_CUSTOM_VALUE}>{customLabel}</option>
      </select>
      {isCustom ? (
        <input
          className="guided-choice-custom"
          id={customInputId}
          type="text"
          value={state.custom}
          placeholder={customPlaceholder}
          aria-label={`${label}: valore non presente in elenco`}
          onChange={(event) => setState((current) => ({ ...current, custom: event.target.value }))}
        />
      ) : null}
      <input type="hidden" name={name} value={resolved} />
      {help ? <span className="field-help">{help}</span> : null}
    </label>
  );
}
