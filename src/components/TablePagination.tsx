'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DEFAULT_PAGE_SIZE, getPageSizeOption, PAGE_SIZE_OPTIONS, type PaginatedItems } from '@/lib/pagination';

type TablePaginationProps = Pick<PaginatedItems<unknown>, 'currentPage' | 'from' | 'to' | 'totalItems' | 'totalPages'> & {
  pathname: string;
  searchParams: object;
};

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  return Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

export function TablePagination({ currentPage, from, pathname, searchParams, to, totalItems, totalPages }: TablePaginationProps) {
  const router = useRouter();

  const baseParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams as Record<string, string | string[] | undefined>)) {
    if (key === 'page' || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => baseParams.append(key, entry));
    else baseParams.set(key, value);
  }

  const selectedPageSize = getPageSizeOption((searchParams as { pageSize?: string }).pageSize);
  if (totalItems <= DEFAULT_PAGE_SIZE && selectedPageSize === String(DEFAULT_PAGE_SIZE)) return null;

  function hrefFor(page: number): string {
    const params = new URLSearchParams(baseParams);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const visiblePages = getVisiblePages(currentPage, totalPages);

  function setPageSize(value: string) {
    const params = new URLSearchParams(baseParams);
    params.delete('page');
    if (value === String(DEFAULT_PAGE_SIZE)) params.delete('pageSize');
    else params.set('pageSize', value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <nav className="table-pagination" aria-label="Paginazione risultati">
      <div className="pagination-meta">
        <span className="pagination-summary">{from}-{to} di {totalItems}</span>
        <label className="pagination-size">
          <span>Righe</span>
          <select
            aria-label="Righe per pagina"
            value={selectedPageSize}
            onChange={(event) => setPageSize(event.target.value)}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option === 'all' ? 'Tutte' : option}</option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 ? (
        <div className="pagination-pages">
          {currentPage > 1 ? (
            <Link className="pagination-direction" href={hrefFor(currentPage - 1)} aria-label="Pagina precedente">
              <ChevronLeft size={16} aria-hidden />
              <span>Precedente</span>
            </Link>
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
                  <Link className={page === currentPage ? 'is-current' : undefined} href={hrefFor(page)} aria-current={page === currentPage ? 'page' : undefined}>
                    {page}
                  </Link>
                </span>
              );
            })}
          </div>
          {currentPage < totalPages ? (
            <Link className="pagination-direction" href={hrefFor(currentPage + 1)} aria-label="Pagina successiva">
              <span>Successiva</span>
              <ChevronRight size={16} aria-hidden />
            </Link>
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
