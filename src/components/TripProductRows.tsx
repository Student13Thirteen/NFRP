'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TripSelectOption } from '@/lib/trips';
import { FORM_DRAFT_RESTORE_EVENT, formDraftFromEvent } from '@/lib/form-draft';

export type TripProductRowValue = {
  id?: string;
  salesPointId?: string | null;
  productId?: string | null;
  liters?: number | null;
};

type TripProductRowsProps = {
  salesPoints: TripSelectOption[];
  products: TripSelectOption[];
  defaultRows?: TripProductRowValue[];
  disabled?: boolean;
};

type EditableTripProductRow = {
  key: string;
  salesPointId: string;
  productId: string;
  liters: string;
};

function renderOptions(options: TripSelectOption[]) {
  return options.map((option) => (
    <option key={option.id} value={option.id}>
      {option.label}
      {option.active === false ? ' (non attivo)' : ''}
    </option>
  ));
}

function buildInitialRows(defaultRows: TripProductRowValue[] | undefined): EditableTripProductRow[] {
  const rows = defaultRows?.length ? defaultRows : [{ salesPointId: '', productId: '', liters: null }];

  return rows.map((row, index) => ({
    key: row.id || `initial-${index}`,
    salesPointId: row.salesPointId || '',
    productId: row.productId || '',
    liters: row.liters && row.liters > 0 ? String(row.liters) : ''
  }));
}

export function TripProductRows({ salesPoints, products, defaultRows, disabled = false }: TripProductRowsProps) {
  const fieldsetRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<EditableTripProductRow[]>(() => buildInitialRows(defaultRows));
  const nextKey = useRef(rows.length);

  function updateRow(key: string, field: 'salesPointId' | 'productId' | 'liters', value: string) {
    setRows((currentRows) => currentRows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    const rowKey = `new-${nextKey.current}`;
    nextKey.current += 1;
    setRows((currentRows) => [...currentRows, { key: rowKey, salesPointId: '', productId: '', liters: '' }]);
  }

  function removeRow(key: string) {
    setRows((currentRows) => {
      if (currentRows.length <= 1) return currentRows;
      return currentRows.filter((row) => row.key !== key);
    });
  }

  useEffect(() => {
    const form = fieldsetRef.current?.closest('form');
    if (!form) return;
    const restore = (event: Event) => {
      const values = formDraftFromEvent(event)?.values;
      if (!values) return;
      const rowCount = Math.max(values.salesPointId?.length || 0, values.productId?.length || 0, values.liters?.length || 0);
      if (rowCount === 0) return;
      setRows(Array.from({ length: rowCount }, (_, index) => ({
        key: `recovered-${index}`,
        salesPointId: values.salesPointId?.[index] || '',
        productId: values.productId?.[index] || '',
        liters: values.liters?.[index] || ''
      })));
      nextKey.current = rowCount;
    };
    form.addEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
    return () => form.removeEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
  }, []);

  return (
    <div className="trip-product-fieldset" ref={fieldsetRef}>
      <div className="trip-product-list">
        {rows.map((row, index) => (
          <div className="trip-product-row" key={row.key}>
            <label>
              Destinazione / tappa
              <select
                name="salesPointId"
                value={row.salesPointId}
                onChange={(event) => updateRow(row.key, 'salesPointId', event.target.value)}
                required
                disabled={disabled}
              >
                <option value="">Seleziona destinazione</option>
                {renderOptions(salesPoints)}
              </select>
            </label>
            <label>
              Prodotto
              <select
                name="productId"
                value={row.productId}
                onChange={(event) => updateRow(row.key, 'productId', event.target.value)}
                required
                disabled={disabled}
              >
                <option value="">Seleziona prodotto</option>
                {renderOptions(products)}
              </select>
            </label>
            <label>
              Quantita
              <input
                name="liters"
                type="number"
                min={1}
                value={row.liters}
                onChange={(event) => updateRow(row.key, 'liters', event.target.value)}
                required
                disabled={disabled}
              />
              <span className="field-help">{products.find((product) => product.id === row.productId)?.unitLabel || 'L'}</span>
            </label>
            {rows.length > 1 ? (
              <button
                aria-label={`Rimuovi scarico ${index + 1}`}
                className="secondary-button compact-button trip-product-remove"
                disabled={disabled}
                onClick={() => removeRow(row.key)}
                title="Rimuovi scarico"
                type="button"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            ) : (
              <span className="trip-product-remove-spacer" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={addRow} disabled={disabled}>
        <Plus size={16} aria-hidden />
        Aggiungi tappa
      </button>
    </div>
  );
}
