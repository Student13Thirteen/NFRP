'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildPaginationHref,
  DEFAULT_PAGE_SIZE,
  getPageSizeOption,
  getPreservedPaginationParams,
  PAGE_SIZE_OPTIONS,
  type PaginatedItems,
  type PaginationSearchParams
} from '@/lib/pagination';

type TablePaginationProps = Pick<PaginatedItems<unknown>, 'currentPage' | 'from' | 'to' | 'totalItems' | 'totalPages'> & {
  pathname: string;
  searchParams: object;
};

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  return Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

/**
 * Barra di paginazione degli elenchi gestionali.
 *
 * Il numero di righe e il cambio pagina usano una navigazione vera del browser
 * (form GET e collegamenti normali) invece di un aggiornamento lato client.
 * Con il vecchio aggiornamento client la tendina era un campo controllato: fino
 * al termine dell'aggiornamento continuava a mostrare il valore precedente e,
 * su elenchi lunghi (200 righe o "Tutte") o con la pagina rimasta su una
 * versione precedente dell'applicazione, l'operatore vedeva la scelta tornare a
 * 50 come se il gestionale l'avesse ignorata. Con la navigazione GET la pagina
 * arriva sempre dal server gia impaginata come richiesto.
 */
export function TablePagination({ currentPage, from, pathname, searchParams, to, totalItems, totalPages }: TablePaginationProps) {
  const preservedParams = getPreservedPaginationParams(searchParams as PaginationSearchParams);
  const selectedPageSize = getPageSizeOption((searchParams as { pageSize?: string }).pageSize);
  if (totalItems <= DEFAULT_PAGE_SIZE && selectedPageSize === String(DEFAULT_PAGE_SIZE)) return null;

  function hrefFor(page: number): string {
    return buildPaginationHref(pathname, preservedParams, { page, pageSize: selectedPageSize });
  }

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <nav className="table-pagination" aria-label="Paginazione risultati">
      <div className="pagination-meta">
        <span className="pagination-summary">{from}-{to} di {totalItems}</span>
        <form className="pagination-size" method="get" action={pathname}>
          {preservedParams.map(([key, value], index) => (
            <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
          ))}
          <label className="pagination-size-label">
            <span>Righe</span>
            <select
              aria-label="Righe per pagina"
              key={selectedPageSize}
              defaultValue={selectedPageSize}
              name="pageSize"
              onChange={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                // `requestSubmit` non esiste sui browser piu vecchi: li si invia
                // il form direttamente, il risultato per l'operatore e lo stesso.
                if (typeof form.requestSubmit === 'function') form.requestSubmit();
                else form.submit();
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'Tutte' : option}</option>
              ))}
            </select>
          </label>
          {/* Serve solo a chi naviga da tastiera o senza JavaScript: la scelta
              della tendina viene comunque inviata al cambio valore. */}
          <button className="screen-reader-only" type="submit">Applica righe per pagina</button>
        </form>
      </div>
      {totalPages > 1 ? (
        <div className="pagination-pages">
          {currentPage > 1 ? (
            <a className="pagination-direction" href={hrefFor(currentPage - 1)} aria-label="Pagina precedente">
              <ChevronLeft size={16} aria-hidden />
              <span>Precedente</span>
            </a>
          ) : (
            <span className="pagination-direction is-disabled" aria-hidden>
              <ChevronLeft size={16} />
              <span>Precedente</span>
            </span>
          )}
          <div className="pagination-numbers">
            {visiblePages.map((page, index) => {
              const previousPage = visiblePages[index - 1];
              return (
                <span className="pagination-number-group" key={page}>
                  {previousPage && page - previousPage > 1 ? <span className="pagination-gap" aria-hidden>...</span> : null}
                  <a className={page === currentPage ? 'is-current' : undefined} href={hrefFor(page)} aria-current={page === currentPage ? 'page' : undefined}>
                    {page}
                  </a>
                </span>
              );
            })}
          </div>
          {currentPage < totalPages ? (
            <a className="pagination-direction" href={hrefFor(currentPage + 1)} aria-label="Pagina successiva">
              <span>Successiva</span>
              <ChevronRight size={16} aria-hidden />
            </a>
          ) : (
            <span className="pagination-direction is-disabled" aria-hidden>
              <span>Successiva</span>
              <ChevronRight size={16} />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
