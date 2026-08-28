import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MaintenanceStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { maintenanceToCloseFilterValue, maintenanceToCloseStatuses } from '@/lib/maintenance';
import { maintenanceRegisterStatusOptions } from '@/lib/maintenance-register';
import { getUnifiedMaintenanceTarget } from '@/proxy';
import {
  getActiveNavigationContext,
  getCompactExpandedNavigationGroupIds,
  getExpandedNavigationGroupIds,
  isActivePath,
  navigationGroups,
  toggleNavigationGroupId
} from '@/components/app-navigation-config';

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/** Titolo (H1) reso da `PageHeader` nella pagina che risponde a una rotta. */
function pageTitle(route: string): string {
  const pageSource = source(path.join('src/app/(protected)', route, 'page.tsx'));
  const match = pageSource.match(/title="([^"]+)"/);
  if (!match) throw new Error(`Nessun titolo statico trovato per ${route}`);
  return match[1];
}

const allGroupIds = navigationGroups.map((group) => group.id);

describe('shell di navigazione', () => {
  it('su desktop tiene aperti tutti i gruppi, cosi ogni area e a un click dalla dashboard', () => {
    expect(getExpandedNavigationGroupIds()).toEqual(allGroupIds);
    expect(getCompactExpandedNavigationGroupIds('/dashboard')).toEqual([]);
  });

  it('su schermo stretto lascia aperto solo il gruppo della pagina corrente', () => {
    expect(getCompactExpandedNavigationGroupIds('/tolls')).toEqual(['control']);
    expect(getCompactExpandedNavigationGroupIds('/drivers')).toEqual(['fleet']);
    expect(getCompactExpandedNavigationGroupIds('/documents/inbox')).toEqual([]);
  });

  it('apre e chiude ogni gruppo in modo indipendente dagli altri', () => {
    const afterClose = toggleNavigationGroupId(allGroupIds, 'fleet');

    expect(afterClose).not.toContain('fleet');
    expect(afterClose).toContain('work');
    expect(afterClose).toContain('control');
    expect(toggleNavigationGroupId(afterClose, 'fleet')).toContain('fleet');
  });

  it('mantiene una posizione attiva anche nelle pagine figlie di Acquisisci', () => {
    expect(isActivePath('/acquisitions/invoices', '/acquisitions')).toBe(true);
    expect(getActiveNavigationContext('/acquisitions/invoices')?.item.label).toBe('Acquisisci');
    expect(isActivePath('/acquisitions', '/documents')).toBe(false);
  });

  it('non riporta la sidebar a un solo gruppo aperto per volta', () => {
    const navigationSource = source('src/components/AppNavigation.tsx');

    expect(navigationSource).toContain('useState<string[]>(() => getExpandedNavigationGroupIds())');
    expect(navigationSource).toContain('toggleNavigationGroupId(current, group.id)');
  });

  it('toglie dal percorso di tabulazione il menu mobile chiuso', () => {
    expect(source('src/components/AppNavigation.tsx')).toContain('inert={compactShell && !open}');
  });

  it('nasconde il drawer chiuso gia al primo paint, senza attendere l’idratazione', () => {
    const compactShell = source('src/app/globals.css').split('@media (max-width: 940px) {').pop() ?? '';
    const closedDrawer = compactShell.slice(compactShell.indexOf('.sidebar {'), compactShell.indexOf('.sidebar-heading {'));

    expect(closedDrawer).toContain('visibility: hidden;');
    expect(closedDrawer).toContain('.sidebar.is-open');
    expect(closedDrawer.slice(closedDrawer.indexOf('.sidebar.is-open'))).toContain('visibility: visible;');
  });

  it('annuncia una sola destinazione corrente: il gruppo resta evidenziato solo visivamente', () => {
    const navigationSource = source('src/components/AppNavigation.tsx');

    expect(navigationSource.match(/aria-current=/g)).toHaveLength(1);
    expect(navigationSource).toContain("aria-current={active ? 'page' : undefined}");
    expect(navigationSource).toContain("isCurrent ? ' is-current' : ''");
  });
});

describe('etichette di menu e destinazioni', () => {
  // Rotte in cui etichetta di menu e titolo della pagina devono coincidere.
  // Escluse consapevolmente: /dashboard, /acquisitions, /documents/history, /others
  // (titoli di pagine non di mia competenza) e /vehicles/* (titolo dinamico).
  const alignedRoutes = [
    '/trips',
    '/customers',
    '/documents',
    '/documents/disposed',
    '/fuel',
    '/tolls',
    '/leases',
    '/costs',
    '/maintenances',
    '/warehouse',
    '/drivers',
    '/nfrp-bot',
    '/settings/document-types',
    '/settings/notifications'
  ];

  it('usa nel menu lo stesso nome del titolo della pagina aperta', () => {
    const items = navigationGroups.flatMap((group) => group.items);

    for (const route of alignedRoutes) {
      const item = items.find((candidate) => candidate.href === route);
      expect(item, `voce di menu mancante per ${route}`).toBeDefined();
      expect(item?.label, route).toBe(pageTitle(route));
    }
  });

  it('chiama Pedaggi l’area dei pedaggi in menu, pagina e centro costi', () => {
    const items = navigationGroups.flatMap((group) => group.items);

    expect(items.find((item) => item.href === '/tolls')?.label).toBe('Pedaggi');
    expect(pageTitle('/tolls')).toBe('Pedaggi');
    expect(source('src/lib/cost-center.ts')).toContain("case 'TOLLS':\n      return 'Pedaggi';");
  });
});

describe('pulsanti che dichiarano la destinazione', () => {
  it('nomina nei pedaggi le pagine realmente aperte', () => {
    const tolls = source('src/app/(protected)/tolls/page.tsx');

    expect(tolls).toContain(pageTitle('/tolls/cards'));
    expect(tolls).toContain(pageTitle('/tolls/import'));
    expect(tolls).toContain(pageTitle('/tolls/import/review'));
  });

  it('nel centro costi apre la sezione indicata nel testo del link', () => {
    const costs = source('src/app/(protected)/costs/page.tsx');
    const destinations: Array<[string, string]> = [
      ['/trips/fuel', 'Viaggi consegna carburante'],
      ['/trips/container', 'Trasporti container'],
      ['/fuel', 'Rifornimenti'],
      ['/tolls', 'Pedaggi'],
      ['/leases', 'Leasing'],
      ['/maintenances', 'Manutenzioni'],
      ['/documents', 'Documenti'],
      ['/warehouse', 'Magazzino']
    ];

    for (const [route, label] of destinations) {
      expect(pageTitle(route), route).toBe(label);
      expect(costs, route).toContain(`{ href: '${route}', label: '${label}' }`);
    }

    expect(costs).toContain('Apri {destination.label}');
  });

  it('nel centro costi usa la stessa azione manutenzione del resto del prodotto', () => {
    const costs = source('src/app/(protected)/costs/page.tsx');

    expect(costs).toContain('Inserisci nuova manutenzione');
    expect(costs).not.toContain('Nuova spesa');
    expect(costs).not.toContain('Registra fattura o DDT');
  });

  it('espone i verbali nel centro Acquisizioni e nel registro con lo stesso ingresso PDF', () => {
    const acquisitions = source('src/app/(protected)/acquisitions/page.tsx');
    const fines = source('src/app/(protected)/fines/page.tsx');

    expect(acquisitions).toContain("title: 'Verbali'");
    expect(acquisitions).toContain("importHref: '/fines/import'");
    expect(acquisitions).toContain("reviewHref: '/fines?status=TO_REVIEW'");
    expect(fines).toContain('href="/fines/import"');
    expect(pageTitle('/fines/import')).toBe('Acquisisci verbali da PDF');
  });

  it('dichiara nel centro costi l’ambito applicato ai totali', () => {
    expect(source('src/app/(protected)/costs/page.tsx')).toContain('Totali calcolati sulla vista');
  });

  it('apre da manutenzioni e dashboard pagine con lo stesso titolo del pulsante', () => {
    const hub = source('src/app/(protected)/maintenances/page.tsx');
    const dashboard = source('src/app/(protected)/dashboard/page.tsx');

    expect(pageTitle('/maintenances/new')).toBe('Inserisci nuova manutenzione');
    expect(pageTitle('/maintenances/expenses/import')).toBe('Importa manutenzioni da PDF');

    for (const label of ['Inserisci nuova manutenzione', 'Importa manutenzioni da PDF']) {
      expect(hub, label).toContain(`<strong>${label}</strong>`);
    }

    expect(dashboard).toContain('<span>Manutenzioni</span>');
    expect(dashboard).toContain('<span>Inserisci nuova manutenzione</span>');
    expect(source('src/app/(protected)/acquisitions/page.tsx')).toContain('Inserisci nuova manutenzione');
  });

  it('porta il pulsante viaggi sempre sull’import, lasciando la revisione al solo banner', () => {
    const trips = source('src/app/(protected)/trips/page.tsx');

    expect(trips).toContain('href="/trips/import"');
    expect(trips).not.toContain("pendingImports > 0 ? '/trips/import/review'");
    expect(trips.match(/\/trips\/import\/review/g)).toHaveLength(1);
    expect(pageTitle('/trips/import')).toBe('Importa bolle container');
  });
});

describe('priorita manutenzioni del quadro operativo', () => {
  it('conta e filtra gli stessi stati aperti', () => {
    expect(maintenanceToCloseStatuses).toEqual([MaintenanceStatus.OPEN, MaintenanceStatus.IN_PROGRESS]);

    const dashboard = source('src/app/(protected)/dashboard/page.tsx');
    expect(dashboard).toContain('status: { in: maintenanceToCloseStatuses }');
    expect(dashboard).toContain('href: `/maintenances?status=${maintenanceToCloseFilterValue}`');
    expect(dashboard).toContain("detail: 'Interventi da fare o in lavorazione'");
  });

  it('offre nel registro unico lo stesso filtro della priorita', () => {
    expect(maintenanceRegisterStatusOptions.map((option) => option.value)).toContain(maintenanceToCloseFilterValue);
    expect(source('src/app/(protected)/maintenances/page.tsx')).toContain('maintenanceRegisterStatusOptions.map');
  });
});

describe('inserimento manutenzioni unificato', () => {
  it('tiene un solo ingresso manuale, con le righe sempre disponibili', () => {
    const hub = source('src/app/(protected)/maintenances/page.tsx');
    const form = source('src/app/(protected)/maintenances/new/page.tsx');

    expect(form).toContain('ExpenseLinesEditor');
    expect(form).toContain('createExpenseDocumentAction');
    expect(hub).not.toContain('/maintenances/expenses/new');
    expect(source('src/app/(protected)/maintenances/expenses/new/page.tsx')).toContain("redirect('/maintenances/new')");
  });

  it('porta il vecchio registro fatture nel registro unico, conservando i filtri', () => {
    expect(getUnifiedMaintenanceTarget('/maintenances/expenses')).toBe('/maintenances');
    expect(getUnifiedMaintenanceTarget('/maintenances/expenses/new')).toBe('/maintenances/new');
    // Le rotte figlie restano dove sono: dettaglio, modifica, controllo e import.
    expect(getUnifiedMaintenanceTarget('/maintenances/expenses/review')).toBeNull();
    expect(getUnifiedMaintenanceTarget('/maintenances/expenses/abc123')).toBeNull();
    expect(source('src/components/MaintenanceSectionNav.tsx')).not.toContain("label: 'Fatture e DDT'");
  });

  it('usa una sola parola per il controllo prima dei costi', () => {
    // La coda contiene anche le fatture leasing importate: il titolo resta neutro come la scheda.
    expect(pageTitle('/maintenances/expenses/review')).toBe('Da controllare');
    expect(source('src/components/MaintenanceSectionNav.tsx')).toContain("label: 'Da controllare'");
  });
});
