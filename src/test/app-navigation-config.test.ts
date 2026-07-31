import { describe, expect, it } from 'vitest';
import {
  getActiveNavigationContext,
  isActivePath,
  navigationGroups
} from '@/components/app-navigation-config';

describe('navigazione manutenzioni e fatture', () => {
  it('espone una sola area e apre come ingresso il registro fatture', () => {
    const control = navigationGroups.find((group) => group.id === 'control');

    expect(
      control?.items.filter((item) => item.href.startsWith('/maintenances')).map((item) => [item.href, item.label])
    ).toEqual([['/maintenances/expenses', 'Manutenzioni e fatture']]);
  });

  it('mantiene la stessa area attiva su fatture, validazione e schede intervento', () => {
    expect(isActivePath('/maintenances/expenses/cms123', '/maintenances/expenses')).toBe(true);
    expect(isActivePath('/maintenances/expenses/review', '/maintenances/expenses')).toBe(true);
    expect(isActivePath('/maintenances/cms456', '/maintenances/expenses')).toBe(true);
    expect(getActiveNavigationContext('/maintenances/cms456')?.item.label).toBe('Manutenzioni e fatture');
  });
});
