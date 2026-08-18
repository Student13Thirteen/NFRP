import { describe, expect, it } from 'vitest';
import { findDriverNameSuggestion } from '@/lib/driver-name-match';

const drivers = [
  { id: 'andrea', firstName: 'MARCO ANDREA', lastName: 'VERDI', active: true },
  { id: 'michele', firstName: 'MICHELE', lastName: 'DE LUCA', active: true },
  { id: 'simone', firstName: 'SIMONE', lastName: 'DE LUCA', active: true },
  { id: 'luca-rossi', firstName: 'LUCA', lastName: 'ROSSI', active: true },
  { id: 'luca-bianchi', firstName: 'LUCA', lastName: 'BIANCHI', active: true }
];

describe('driver name suggestions for trip imports', () => {
  it('matches a unique first name inside a longer registry name', () => {
    expect(findDriverNameSuggestion('ANDREA', drivers)?.driver.id).toBe('andrea');
  });

  it('uses both first and last names regardless of their order', () => {
    expect(findDriverNameSuggestion('VERDI ANDREA MARCO', drivers)?.driver.id).toBe('andrea');
  });

  it('tolerates a small OCR spelling difference', () => {
    expect(findDriverNameSuggestion('MICHEL DE LUCA', drivers)?.driver.id).toBe('michele');
  });

  it('does not guess when a first name belongs to multiple drivers', () => {
    expect(findDriverNameSuggestion('LUCA', drivers)).toBeNull();
  });

  it('does not guess when only a shared surname is available', () => {
    expect(findDriverNameSuggestion('DE LUCA', drivers)).toBeNull();
  });

  it('rejects a weak unrelated match', () => {
    expect(findDriverNameSuggestion('SAVERIO', drivers)).toBeNull();
  });
});
