import { describe, expect, it } from 'vitest';
import {
  GUIDED_CHOICE_CUSTOM_VALUE,
  guidedChoiceInitialState,
  resolveGuidedChoice
} from '@/lib/guided-choice';

const containerTypes = ['IMPORT 20 BOX', 'IMPORT 40 HC', 'EXPORT 40 BOX', '45 HC'];

describe('scelte guidate del foglio viaggi container', () => {
  it('lascia la tendina vuota quando il campo non e compilato', () => {
    expect(guidedChoiceInitialState(null, containerTypes)).toEqual({ selection: '', custom: '' });
    expect(guidedChoiceInitialState('   ', containerTypes)).toEqual({ selection: '', custom: '' });
  });

  it('seleziona la voce prevista dal foglio operativo', () => {
    expect(guidedChoiceInitialState('IMPORT 40 HC', containerTypes)).toEqual({
      selection: 'IMPORT 40 HC',
      custom: ''
    });
  });

  it('riconosce la stessa voce con spaziatura o maiuscole diverse', () => {
    expect(guidedChoiceInitialState('  import   40 hc ', containerTypes).selection).toBe('IMPORT 40 HC');
  });

  it('apre il campo libero conservando un valore reale non ancora in elenco', () => {
    // Il foglio chiede di verificare se esistono altre tipologie e la foto della LDV 002080
    // ha portato un `45HC` senza spazio: non deve andare perso ne essere riscritto.
    expect(guidedChoiceInitialState('45HC', containerTypes)).toEqual({
      selection: GUIDED_CHOICE_CUSTOM_VALUE,
      custom: '45HC'
    });
  });

  it('invia il valore scelto oppure quello scritto a mano', () => {
    expect(resolveGuidedChoice({ selection: 'EXPORT 40 BOX', custom: 'ignorato' })).toBe('EXPORT 40 BOX');
    expect(resolveGuidedChoice({ selection: GUIDED_CHOICE_CUSTOM_VALUE, custom: '  45HC  ' })).toBe('45HC');
    expect(resolveGuidedChoice({ selection: '', custom: 'non usato' })).toBe('');
  });

  it('non propone una voce libera vuota come valore valido', () => {
    expect(resolveGuidedChoice({ selection: GUIDED_CHOICE_CUSTOM_VALUE, custom: '   ' })).toBe('');
  });
});
