import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPaginationHref, getPreservedPaginationParams, paginateItems } from '@/lib/pagination';

const rows = Array.from({ length: 235 }, (_, index) => index + 1);

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('paginateItems', () => {
  it('supporta i tagli 50, 100 e 200', () => {
    expect(paginateItems(rows, '2', '100').items).toEqual(rows.slice(100, 200));
    expect(paginateItems(rows, '2', '200').items).toEqual(rows.slice(200));
  });

  it('mostra tutti i record in una sola pagina', () => {
    const pagination = paginateItems(rows, '9', 'all');
    expect(pagination.currentPage).toBe(1);
    expect(pagination.totalPages).toBe(1);
    expect(pagination.items).toEqual(rows);
  });

  it('ripiega sul valore predefinito per parametri non validi', () => {
    expect(paginateItems(rows, '1', '500').items).toHaveLength(50);
  });
});

describe('parametri conservati dalla barra di paginazione', () => {
  it('mantiene filtri e ricerca ma ricalcola pagina e righe', () => {
    expect(
      getPreservedPaginationParams({ q: 'ZZ575ZZ', review: 'needs_review', page: '3', pageSize: '200', tractorId: undefined })
    ).toEqual([
      ['q', 'ZZ575ZZ'],
      ['review', 'needs_review']
    ]);
  });

  it('conserva i filtri ripetuti sulla stessa chiave', () => {
    expect(getPreservedPaginationParams({ status: ['OPEN', 'IN_PROGRESS'] })).toEqual([
      ['status', 'OPEN'],
      ['status', 'IN_PROGRESS']
    ]);
  });

  it('porta il numero di righe scelto anche sulle altre pagine', () => {
    const preserved = getPreservedPaginationParams({ q: 'ZZ575ZZ', pageSize: '200' });

    expect(buildPaginationHref('/fuel', preserved, { page: 2, pageSize: '200' })).toBe('/fuel?q=ZZ575ZZ&pageSize=200&page=2');
    expect(buildPaginationHref('/fuel', preserved, { page: 1, pageSize: 'all' })).toBe('/fuel?q=ZZ575ZZ&pageSize=all');
  });

  it('non sporca la URL quando il taglio e quello predefinito', () => {
    expect(buildPaginationHref('/fuel', [], { page: 1, pageSize: '50' })).toBe('/fuel');
    expect(buildPaginationHref('/fuel', [], { page: 4, pageSize: '50' })).toBe('/fuel?page=4');
  });
});

// La scelta delle righe deve arrivare al server come navigazione vera: con il
// vecchio aggiornamento lato client la tendina era un campo controllato e
// tornava a 50 finche la navigazione non finiva, cosa che su elenchi lunghi
// (200 righe o "Tutte") faceva sembrare che il gestionale ignorasse la scelta.
describe('controllo righe per pagina', () => {
  const component = source('src/components/TablePagination.tsx');

  it('invia la scelta con un form GET verso la pagina corrente', () => {
    expect(component).toContain('<form className="pagination-size" method="get" action={pathname}>');
    expect(component).toContain('name="pageSize"');
  });

  it('non tiene la tendina controllata e non usa il router client', () => {
    expect(component).toContain('defaultValue={selectedPageSize}');
    expect(component).not.toContain('value={selectedPageSize}');
    expect(component).not.toContain('useRouter');
    expect(component).not.toContain('router.push');
  });

  it('ripropone i filtri attivi come campi nascosti del form', () => {
    expect(component).toContain('preservedParams.map(([key, value], index) => (');
    expect(component).toContain('<input key={`${key}-${index}`} type="hidden" name={key} value={value} />');
  });
});

// Ogni elenco filtrabile deve conservare le righe per pagina quando l'operatore
// applica un filtro: i filtri sono form GET e senza il campo nascosto la lista
// ripartiva sempre da 50 righe.
describe('filtri degli elenchi', () => {
  const filterPages = [
    'costs',
    'fines',
    'fuel',
    'leases',
    'maintenances',
    'road-accidents',
    'tolls',
    'tolls/imports/[batchId]',
    'trips/container',
    'trips/fuel',
    'warehouse'
  ];

  it.each(filterPages)('%s conserva il numero di righe scelto', (route) => {
    const pageSource = source(path.join('src/app/(protected)', route, 'page.tsx'));

    expect(pageSource).toContain("import { PageSizeField } from '@/components/PageSizeField';");
    expect(pageSource).toMatch(/<form className="filter-bar[^"]*" action=(?:"[^"]*"|\{`[^`]*`\})><?\s*\n?\s*<PageSizeField pageSize=\{[a-zA-Z]+\.pageSize\} \/>/);
  });

  it('conserva il taglio anche nei tre registri che usano i filtri Documenti condivisi', () => {
    const documentFilters = source('src/components/DocumentFilters.tsx');
    expect(documentFilters).toContain("params.set('pageSize', selectedPageSize)");

    for (const route of ['documents', 'documents/history', 'documents/disposed']) {
      const pageSource = source(path.join('src/app/(protected)', route, 'page.tsx'));
      expect(pageSource).toContain('pageSize={resolvedSearchParams.pageSize}');
    }
  });
});
