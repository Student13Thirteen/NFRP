'use client';

import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { filterRegistryRows } from '@/lib/registry-search';

export type RegistryEntry = {
  id: string;
  /** Testo normalizzato costruito lato server con `buildRegistrySearchText`. */
  search: string;
};

export type RegistryTableRow = RegistryEntry & {
  /** Le sole celle `<td>`: la riga e il suo comportamento restano di questo componente. */
  cells: ReactNode;
};

export type RegistryListItem = RegistryEntry & {
  content: ReactNode;
};

type SearchFieldProps = {
  query: string;
  onChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  entityLabel: string;
  total: number;
  visible: number;
};

function RegistrySearchField({
  query,
  onChange,
  searchLabel,
  searchPlaceholder,
  entityLabel,
  total,
  visible
}: SearchFieldProps) {
  const isSearching = query.trim().length > 0;

  return (
    <div className="registry-search-bar">
      <label className="search-field">
        {searchLabel}
        <span className="search-input-wrap">
          <Search size={16} aria-hidden />
          <input
            type="search"
            name="registrySearch"
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      </label>
      <span className="filter-count" role="status" aria-live="polite">
        {isSearching ? `${visible} di ${total} ${entityLabel}` : `${total} ${entityLabel}`}
      </span>
      <button className="secondary-button" type="button" onClick={() => onChange('')} disabled={!isSearching}>
        <X size={16} aria-hidden />
        Azzera ricerca
      </button>
    </div>
  );
}

function noResultsText(query: string): string {
  return `Nessun risultato per "${query.trim()}". Prova con una parte del nome, della targa o del recapito.`;
}

type RegistryTableProps = {
  rows: RegistryTableRow[];
  head: ReactNode;
  columnCount: number;
  searchLabel: string;
  searchPlaceholder: string;
  /** Nome plurale dei record, usato nel conteggio: `autisti`, `mezzi`, `clienti`. */
  entityLabel: string;
  emptyText: string;
};

/**
 * Elenco anagrafico con ricerca immediata.
 *
 * Le righe arrivano gia renderizzate dal server e il filtro lavora nel browser:
 * digitando, i risultati si riducono senza attendere una nuova richiesta. Le
 * anagrafiche sono elenchi brevi; le liste che crescono senza limite continuano
 * a usare la paginazione lato server. Il conteggio resta sempre visibile, cosi
 * si capisce quante righe la ricerca sta nascondendo.
 */
export function RegistryTable({
  rows,
  head,
  columnCount,
  searchLabel,
  searchPlaceholder,
  entityLabel,
  emptyText
}: RegistryTableProps) {
  const [query, setQuery] = useState('');
  const visibleRows = useMemo(() => filterRegistryRows(rows, query), [rows, query]);

  return (
    <>
      <RegistrySearchField
        query={query}
        onChange={setQuery}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        entityLabel={entityLabel}
        total={rows.length}
        visible={visibleRows.length}
      />
      <section className="table-wrap">
        <table>
          <thead>{head}</thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={columnCount}>{emptyText}</td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="empty-state" colSpan={columnCount}>{noResultsText(query)}</td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr className="clickable-row" key={row.id}>
                  {row.cells}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

type RegistryListProps = {
  items: RegistryListItem[];
  searchLabel: string;
  searchPlaceholder: string;
  entityLabel: string;
  emptyState: ReactNode;
  listClassName?: string;
};

/** Stessa ricerca del `RegistryTable` per gli elenchi che non sono tabelle. */
export function RegistryList({
  items,
  searchLabel,
  searchPlaceholder,
  entityLabel,
  emptyState,
  listClassName = 'assignment-history'
}: RegistryListProps) {
  const [query, setQuery] = useState('');
  const visibleItems = useMemo(() => filterRegistryRows(items, query), [items, query]);

  return (
    <>
      <RegistrySearchField
        query={query}
        onChange={setQuery}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        entityLabel={entityLabel}
        total={items.length}
        visible={visibleItems.length}
      />
      {items.length === 0 ? (
        emptyState
      ) : visibleItems.length === 0 ? (
        <p className="empty-state">{noResultsText(query)}</p>
      ) : (
        <div className={listClassName}>
          {visibleItems.map((item) => (
            <Fragment key={item.id}>{item.content}</Fragment>
          ))}
        </div>
      )}
    </>
  );
}
