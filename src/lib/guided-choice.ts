// Il foglio operativo container distingue i campi con tre colori: azzurro a mano libera,
// giallo scelta a tenda, verde ricavato dal gestionale. I campi gialli devono quindi essere
// tendine vere, non caselle di testo con suggerimenti. Il foglio prevede pero anche tipologie
// non ancora censite ("verificare se ci sono altre tipologie") e la foto reale ha gia portato
// un `45HC`: ogni tendina guidata conserva percio una voce esplicita per scrivere un valore nuovo.

export const GUIDED_CHOICE_CUSTOM_VALUE = '__altro__';

export type GuidedChoiceState = {
  selection: string;
  custom: string;
};

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('it-IT');
}

export function findGuidedChoiceOption(value: string, options: string[]): string | null {
  const wanted = normalizeForComparison(value);
  if (!wanted) return null;
  return options.find((option) => normalizeForComparison(option) === wanted) || null;
}

export function guidedChoiceInitialState(
  value: string | null | undefined,
  options: string[]
): GuidedChoiceState {
  const current = (value || '').trim();
  if (!current) return { selection: '', custom: '' };

  const matched = findGuidedChoiceOption(current, options);
  if (matched) return { selection: matched, custom: '' };
  return { selection: GUIDED_CHOICE_CUSTOM_VALUE, custom: current };
}

export function resolveGuidedChoice(state: GuidedChoiceState): string {
  if (state.selection === GUIDED_CHOICE_CUSTOM_VALUE) return state.custom.trim();
  return state.selection;
}
