import { describe, expect, it } from 'vitest';
import {
  getActiveNavigationContext,
  isActivePath,
  navigationGroups
} from '@/components/app-navigation-config';

describe('navigazione manutenzioni e fatture', () => {
  it('espone l’anagrafica clienti nell’area di lavoro', () => {
    const work = navigationGroups.find((group) => group.id === 'work');
    expect(work?.items.some((item) => item.href === '/customers' && item.label === 'Clienti')).toBe(true);
    expect(getActiveNavigationContext('/customers/customer-1')?.item.label).toBe('Clienti');
  });

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

  it('mantiene Acquisisci attivo durante la revisione della inbox documenti', () => {
    expect(isActivePath('/documents/inbox', '/acquisitions')).toBe(true);
    expect(isActivePath('/documents/inbox/item-1', '/acquisitions')).toBe(true);
    expect(getActiveNavigationContext('/documents/inbox/item-1')?.item.label).toBe('Acquisisci');
  });
});
