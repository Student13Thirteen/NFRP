'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { EntitySelect } from '@/components/EntitySelect';
import type { EntityOption } from '@/lib/entities';

type DocumentTypeOption = {
  id: string;
  name: string;
};

type FilterState = {
  q: string;
  documentTypeId: string;
  entityKey: string;
  status: string;
  pdf: string;
  vehicleStatus: string;
};

type DocumentFiltersProps = {
  documentTypes: DocumentTypeOption[];
  entityOptions: EntityOption[];
  initialFilters: Partial<FilterState>;
  resultCount?: number;
  statusOptions?: { value: string; label: string }[];
  vehicleStatusOptions?: { value: string; label: string }[];
};

const emptyFilters: FilterState = {
  q: '',
  documentTypeId: '',
  entityKey: '',
  status: '',
  pdf: '',
  vehicleStatus: ''
};

const defaultStatusOptions = [
  { value: 'expired', label: 'Scaduti' },
  { value: 'sevenDays', label: 'Entro 7 giorni' },
  { value: 'within30', label: 'Entro 30 giorni' },
  { value: 'valid', label: 'Validi' }
];

const pdfOptions = [
  { value: 'missing', label: 'PDF mancanti' },
  { value: 'present', label: 'PDF presenti' }
];

function normalizeInitialFilters(initialFilters: Partial<FilterState>): FilterState {
  return {
    q: initialFilters.q || '',
    documentTypeId: initialFilters.documentTypeId || '',
    entityKey: initialFilters.entityKey || '',
    status: initialFilters.status || '',
    pdf: initialFilters.pdf || '',
    vehicleStatus: initialFilters.vehicleStatus || ''
  };
}

export function DocumentFilters({
  documentTypes,
  entityOptions,
  initialFilters,
  resultCount,
  statusOptions = defaultStatusOptions,
  vehicleStatusOptions
}: DocumentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<FilterState>(() => normalizeInitialFilters(initialFilters));
  const didMount = useRef(false);

  const applyFilters = useCallback((nextFilters: FilterState) => {
    const params = new URLSearchParams();

    if (nextFilters.q.trim()) params.set('q', nextFilters.q.trim());
    if (nextFilters.documentTypeId) params.set('documentTypeId', nextFilters.documentTypeId);
    if (nextFilters.entityKey) params.set('entityKey', nextFilters.entityKey);
    if (nextFilters.status) params.set('status', nextFilters.status);
    if (nextFilters.pdf) params.set('pdf', nextFilters.pdf);
    if (nextFilters.vehicleStatus) params.set('vehicleStatus', nextFilters.vehicleStatus);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  function updateFilter<Key extends keyof FilterState>(key: Key, value: FilterState[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const timeout = window.setTimeout(() => applyFilters(filters), 280);
    return () => window.clearTimeout(timeout);
  }, [applyFilters, filters]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(filters);
  }

  function resetFilters() {
    setFilters(emptyFilters);
    router.replace(pathname, { scroll: false });
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <form className="filter-bar advanced-filter" onSubmit={handleSubmit}>
      <label className="search-field">
        Ricerca
        <span className="search-input-wrap">
          <Search size={16} aria-hidden />
          <input
            name="q"
            autoComplete="off"
            placeholder="Cerca titolo, targa, autista, file, note..."
            value={filters.q}
            onChange={(event) => updateFilter('q', event.target.value)}
          />
        </span>
      </label>

      <label>
        Tipo
        <select
          name="documentTypeId"
          value={filters.documentTypeId}
          onChange={(event) => updateFilter('documentTypeId', event.target.value)}
        >
          <option value="">Tutti</option>
          {documentTypes.map((documentType) => (
            <option key={documentType.id} value={documentType.id}>
              {documentType.name}
            </option>
          ))}
        </select>
      </label>

      <EntitySelect
        key={filters.entityKey || 'all-entities'}
        name="entityKey"
        options={entityOptions}
        defaultValue={filters.entityKey}
        required={false}
        label="Autista / targa / altro"
        emptyLabel="Tutti"
        placeholder="Cerca targa, autista o entità..."
        onValueChange={(value) => updateFilter('entityKey', value)}
      />

      <label>
        Stato
        <select name="status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">Tutti</option>
          {statusOptions.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        PDF
        <select name="pdf" value={filters.pdf} onChange={(event) => updateFilter('pdf', event.target.value)}>
          <option value="">Tutti</option>
          {pdfOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {vehicleStatusOptions ? (
        <label>
          Uscita flotta
          <select
            name="vehicleStatus"
            value={filters.vehicleStatus}
            onChange={(event) => updateFilter('vehicleStatus', event.target.value)}
          >
            <option value="">Venduti e rottamati</option>
            {vehicleStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="filter-actions">
        <button className="secondary-button" type="submit">
          <Search size={16} aria-hidden />
          Filtra
        </button>
        <button className="secondary-button" type="button" onClick={resetFilters} disabled={!hasFilters}>
          <X size={16} aria-hidden />
          Reset
        </button>
        {typeof resultCount === 'number' ? <span className="filter-count">{resultCount} risultati</span> : null}
      </div>
    </form>
  );
}
