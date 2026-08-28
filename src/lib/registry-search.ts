/**
 * Ricerca istantanea delle anagrafiche.
 *
 * Le anagrafiche (autisti, mezzi a motore, semirimorchi, clienti, proprietari
 * terzi, altre entita) sono elenchi brevi: il filtro gira nel browser sulle
 * righe gia caricate, quindi la lista si aggiorna mentre si digita senza un
 * altro viaggio al server. Per le liste che crescono senza limite resta valida
 * la paginazione lato server gia usata da documenti, viaggi e rifornimenti.
 */

/** Minuscole senza accenti e senza punteggiatura: `ZZ 575 ZZ` e `zz575zz` coincidono. */
export function normalizeRegistryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Testo unico su cui cerca la riga: si passano tutti i valori visibili all'operatore. */
export function buildRegistrySearchText(parts: Array<string | number | null | undefined>): string {
  const joined = parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== '')
    .map((part) => String(part))
    .join(' ');
  return normalizeRegistryText(joined);
}

/**
 * Tutti i termini digitati devono comparire nella riga, in qualsiasi ordine:
 * cosi `rossi iveco` trova l'autista Rossi solo sul suo mezzo Iveco.
 */
export function matchesRegistrySearch(searchText: string, query: string): boolean {
  const terms = normalizeRegistryText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => searchText.includes(term));
}

export function filterRegistryRows<Row extends { search: string }>(rows: Row[], query: string): Row[] {
  if (!normalizeRegistryText(query)) return rows;
  return rows.filter((row) => matchesRegistrySearch(row.search, query));
}
