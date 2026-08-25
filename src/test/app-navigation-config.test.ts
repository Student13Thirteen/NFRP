import { describe, expect, it } from 'vitest';
import {
  getActiveNavigationContext,
  isActivePath,
  navigationGroups
} from '@/components/app-navigation-config';

describe('navigazione manutenzioni', () => {
  it('espone l’anagrafica clienti nell’area di lavoro', () => {
    const work = navigationGroups.find((group) => group.id === 'work');
    expect(work?.items.some((item) => item.href === '/customers' && item.label === 'Clienti')).toBe(true);
    expect(getActiveNavigationContext('/customers/customer-1')?.item.label).toBe('Clienti');
  });

  it('espone una sola area e apre come ingresso l’hub manutenzioni', () => {
    const control = navigationGroups.find((group) => group.id === 'control');

    expect(
      control?.items.filter((item) => item.href.startsWith('/maintenances')).map((item) => [item.href, item.label])
    ).toEqual([['/maintenances', 'Manutenzioni']]);
  });

  it('espone sinistri stradali e verbali come voci separate in Costi e controllo', () => {
    const control = navigationGroups.find((group) => group.id === 'control');
    expect(control?.items.some((item) => item.href === '/road-accidents' && item.label === 'Sinistri stradali')).toBe(true);
    expect(control?.items.some((item) => item.href === '/fines' && item.label === 'Verbali')).toBe(true);
    expect(getActiveNavigationContext('/road-accidents/new')?.groupLabel).toBe('Costi e controllo');
    expect(getActiveNavigationContext('/fines/fine-1')?.item.label).toBe('Verbali');
  });

  it('presenta la flotta tipizzata e l’anagrafica dei proprietari terzi', () => {
    const fleet = navigationGroups.find((group) => group.id === 'fleet');
    expect(fleet?.items.some((item) => item.href === '/vehicles/tractors' && item.label === 'Mezzi a motore')).toBe(true);
    expect(fleet?.items.some((item) => item.href === '/vehicles/owners' && item.label === 'Proprietari terzi')).toBe(true);
  });

  it('mantiene la stessa area attiva su fatture, validazione e schede intervento', () => {
    expect(isActivePath('/maintenances/expenses/cms123', '/maintenances')).toBe(true);
    expect(isActivePath('/maintenances/expenses/review', '/maintenances')).toBe(true);
    expect(isActivePath('/maintenances/cms456', '/maintenances')).toBe(true);
    expect(getActiveNavigationContext('/maintenances/cms456')?.item.label).toBe('Manutenzioni');
  });

  it('mantiene Acquisisci attivo durante la revisione della inbox documenti', () => {
    expect(isActivePath('/documents/inbox', '/acquisitions')).toBe(true);
    expect(isActivePath('/documents/inbox/item-1', '/acquisitions')).toBe(true);
    expect(getActiveNavigationContext('/documents/inbox/item-1')?.item.label).toBe('Acquisisci');
  });
});
