import { describe, expect, it } from 'vitest';
import {
  buildRegistrySearchText,
  filterRegistryRows,
  matchesRegistrySearch,
  normalizeRegistryText
} from '@/lib/registry-search';

describe('ricerca anagrafiche', () => {
  it('ignora accenti, maiuscole e punteggiatura', () => {
    expect(normalizeRegistryText('Nicolò D’Amico')).toBe('nicolo d amico');
    expect(normalizeRegistryText('ZZ 575 ZZ')).toBe('zz 575 zz');
    expect(normalizeRegistryText('mario.rossi@example.it')).toBe('mario rossi example it');
  });

  it('costruisce il testo della riga saltando i campi vuoti', () => {
    expect(buildRegistrySearchText(['Rossi', 'Mario', null, undefined, '', 'ZZ575ZZ'])).toBe('rossi mario zz575zz');
  });

  it('trova la targa anche se digitata con gli spazi', () => {
    const row = buildRegistrySearchText(['ZZ575ZZ', 'Iveco S-Way']);

    expect(matchesRegistrySearch(row, 'zz 575 zz')).toBe(true);
    expect(matchesRegistrySearch(row, 'ZZ575ZZ')).toBe(true);
    expect(matchesRegistrySearch(row, '575')).toBe(true);
  });

  it('richiede tutti i termini digitati, in qualsiasi ordine', () => {
    const row = buildRegistrySearchText(['Rossi Mario', 'ZZ575ZZ', 'Iveco']);

    expect(matchesRegistrySearch(row, 'rossi iveco')).toBe(true);
    expect(matchesRegistrySearch(row, 'iveco rossi')).toBe(true);
    expect(matchesRegistrySearch(row, 'rossi scania')).toBe(false);
  });

  it('senza testo digitato non nasconde nulla', () => {
    const rows = [
      { id: '1', search: buildRegistrySearchText(['Rossi']) },
      { id: '2', search: buildRegistrySearchText(['Bianchi']) }
    ];

    expect(filterRegistryRows(rows, '')).toHaveLength(2);
    expect(filterRegistryRows(rows, '   ')).toHaveLength(2);
    expect(filterRegistryRows(rows, 'bianchi').map((row) => row.id)).toEqual(['2']);
  });
});
