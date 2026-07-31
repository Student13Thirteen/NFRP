'use client';

import { CheckCircle2, Plus, Trash2, Wrench } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  VAT_RATES,
  computeLineVat,
  formatEuroCents,
  imponibileCentsFromUnit
} from '@/lib/expense-shared';

export type AllocationChoice = { value: string; label: string; active?: boolean };
export type CategoryChoice = { id: string; label: string; active?: boolean };

export type ExpenseLineDefault = {
  description?: string;
  code?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  vatRate?: string;
  allocationKey?: string;
  categoryId?: string;
  odometerKm?: string;
};

type ExpenseLinesEditorProps = {
  allocations: AllocationChoice[];
  categories: CategoryChoice[];
  defaultRows?: ExpenseLineDefault[];
  disabled?: boolean;
  vehicleAllocationRequired?: boolean;
  warehouseOrVehicleRequired?: boolean;
};

type EditableLine = {
  key: string;
  description: string;
  code: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  allocationKey: string;
  categoryId: string;
  odometerKm: string;
};

function emptyLine(key: string): EditableLine {
  return {
    key,
    description: '',
    code: '',
    quantity: '1',
    unit: 'pz',
    unitPrice: '',
    vatRate: '22',
    allocationKey: 'GENERIC',
    categoryId: '',
    odometerKm: ''
  };
}

function buildInitialLines(defaultRows: ExpenseLineDefault[] | undefined): EditableLine[] {
  if (!defaultRows || defaultRows.length === 0) return [emptyLine('line-0')];
  return defaultRows.map((row, index) => ({
    key: `line-${index}`,
    description: row.description ?? '',
    code: row.code ?? '',
    quantity: row.quantity ?? '1',
    unit: row.unit ?? 'pz',
    unitPrice: row.unitPrice ?? '',
    vatRate: row.vatRate ?? '22',
    allocationKey: row.allocationKey ?? 'GENERIC',
    categoryId: row.categoryId ?? '',
    odometerKm: row.odometerKm ?? ''
  }));
}

/** Parsing italiano per la sola anteprima live (la verità la fissa il server). */
function toNumber(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineUnitPriceCents(line: EditableLine): number {
  return Math.round(toNumber(line.unitPrice || '0') * 100);
}

function lineImponibileCents(line: EditableLine): number {
  const quantityMilli = Math.round(toNumber(line.quantity || '0') * 1000);
  return imponibileCentsFromUnit(quantityMilli, lineUnitPriceCents(line));
}

export function ExpenseLinesEditor({
  allocations,
  categories,
  defaultRows,
  disabled = false,
  vehicleAllocationRequired = false,
  warehouseOrVehicleRequired = false
}: ExpenseLinesEditorProps) {
  const allocationRequired = vehicleAllocationRequired || warehouseOrVehicleRequired;
  const allocationIsAllowed = (value: string) =>
    value.startsWith('TRACTOR:') ||
    value.startsWith('TRAILER:') ||
    (warehouseOrVehicleRequired && value === 'WAREHOUSE');
  const initialLineCount = buildInitialLines(defaultRows).length;
  const [lines, setLines] = useState<EditableLine[]>(() =>
    buildInitialLines(defaultRows).map((line) => ({
      ...line,
      allocationKey: allocationRequired && !allocationIsAllowed(line.allocationKey) ? '' : line.allocationKey
    }))
  );
  const [bulkAllocation, setBulkAllocation] = useState('');
  const nextKey = useRef(initialLineCount);
  const vehicleAllocations = useMemo(
    () => allocations.filter((option) => option.value.startsWith('TRACTOR:') || option.value.startsWith('TRAILER:')),
    [allocations]
  );
  const requiredAllocations = useMemo(
    () => allocations.filter((option) =>
      option.value.startsWith('TRACTOR:') ||
      option.value.startsWith('TRAILER:') ||
      (warehouseOrVehicleRequired && option.value === 'WAREHOUSE')
    ),
    [allocations, warehouseOrVehicleRequired]
  );

  function updateLine(key: string, field: keyof EditableLine, value: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    const key = `line-${nextKey.current}`;
    nextKey.current += 1;
    setLines((current) => [
      ...current,
      { ...emptyLine(key), allocationKey: allocationRequired ? '' : 'GENERIC' }
    ]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  function applyAllocationToAll(value: string) {
    setBulkAllocation(value);
    if (!value) return;
    setLines((current) => current.map((line) => ({ ...line, allocationKey: value })));
  }

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const imponibile = lineImponibileCents(line);
        const { vatCents, totalCents } = computeLineVat(imponibile, Number(line.vatRate) || 0);
        return {
          imponibile: acc.imponibile + imponibile,
          vat: acc.vat + vatCents,
          total: acc.total + totalCents
        };
      },
      { imponibile: 0, vat: 0, total: 0 }
    );
  }, [lines]);

  const assignedLines = lines.filter((line) => allocationIsAllowed(line.allocationKey)).length;

  return (
    <div className="expense-lines">
      {allocationRequired ? (
        <section className={`maintenance-allocation-prompt${assignedLines === lines.length ? ' complete' : ''}`}>
          <span className="maintenance-allocation-icon" aria-hidden>
            {assignedLines === lines.length ? <CheckCircle2 size={22} /> : <Wrench size={22} />}
          </span>
          <div className="maintenance-allocation-copy">
            <strong>{warehouseOrVehicleRequired ? 'Scegli Magazzino o mezzo' : 'Assegna le operazioni ai mezzi'}</strong>
            <span>
              {assignedLines} di {lines.length} righe assegnate.{' '}
              {warehouseOrVehicleRequired
                ? 'Usa Magazzino se il ricambio non è ancora montato; altrimenti scegli la targa. Se sul PDF è scritto solo l’autista, cercalo accanto alla targa.'
                : 'Usa l’assegnazione rapida oppure scegli targhe diverse sulle singole operazioni.'}
            </span>
          </div>
          <label>
            {warehouseOrVehicleRequired ? 'Applica una destinazione a tutte' : 'Applica una targa a tutte'}
            <select value={bulkAllocation} onChange={(event) => applyAllocationToAll(event.target.value)} disabled={disabled}>
              <option value="">{warehouseOrVehicleRequired ? 'Seleziona destinazione…' : 'Seleziona mezzo…'}</option>
              {(warehouseOrVehicleRequired ? requiredAllocations : vehicleAllocations).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}
      <div className="expense-editor-list">
        {lines.map((line, index) => {
          const imponibile = lineImponibileCents(line);
          const vatRate = Number(line.vatRate) || 0;
          const unitIvato = computeLineVat(lineUnitPriceCents(line), vatRate).totalCents;
          const { totalCents } = computeLineVat(imponibile, vatRate);
          return (
            <section className="expense-editor-row" key={line.key}>
              <div className="expense-editor-row-head">
                <strong>Operazione {index + 1}</strong>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeLine(line.key)}
                    disabled={disabled}
                    aria-label={`Rimuovi operazione ${index + 1}`}
                    title="Rimuovi operazione"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="expense-editor-fields">
                <label className="expense-field-description">
                  Descrizione
                  <input
                    name="lineDescription"
                    value={line.description}
                    onChange={(event) => updateLine(line.key, 'description', event.target.value)}
                    placeholder="Es. Filtro olio, manodopera…"
                    disabled={disabled}
                  />
                </label>
                <label>
                  Codice
                  <input
                    name="lineCode"
                    value={line.code}
                    onChange={(event) => updateLine(line.key, 'code', event.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label>
                  Quantità
                  <input
                    name="lineQuantity"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, 'quantity', event.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label>
                  Unità
                  <input
                    name="lineUnit"
                    value={line.unit}
                    onChange={(event) => updateLine(line.key, 'unit', event.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label>
                  Prezzo unitario netto
                  <input
                    name="lineUnitPrice"
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.key, 'unitPrice', event.target.value)}
                    placeholder="0,00"
                    disabled={disabled}
                  />
                </label>
                <label>
                  IVA
                  <select
                    name="lineVatRate"
                    value={line.vatRate}
                    onChange={(event) => updateLine(line.key, 'vatRate', event.target.value)}
                    disabled={disabled}
                  >
                    {VAT_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="expense-editor-assignment">
                <label className="expense-field-allocation">
                  {warehouseOrVehicleRequired ? 'Destinazione' : vehicleAllocationRequired ? 'Targa' : 'Allocazione'}
                  <select
                    name="lineAllocationKey"
                    value={line.allocationKey}
                    onChange={(event) => updateLine(line.key, 'allocationKey', event.target.value)}
                    disabled={disabled}
                    required={allocationRequired}
                  >
                    {allocationRequired && !allocationIsAllowed(line.allocationKey) ? (
                      <option value="" disabled>
                        {warehouseOrVehicleRequired ? 'Seleziona Magazzino o targa…' : 'Seleziona targa…'}
                      </option>
                    ) : null}
                    {(allocationRequired ? requiredAllocations : allocations).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.active === false ? ' (non attivo)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    name="lineCategoryId"
                    value={line.categoryId}
                    onChange={(event) => updateLine(line.key, 'categoryId', event.target.value)}
                    disabled={disabled}
                  >
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                        {category.active === false ? ' (non attiva)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="expense-field-odometer">
                  Km del mezzo
                  <input
                    name="lineOdometerKm"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={9999999}
                    step={1}
                    value={line.odometerKm}
                    onChange={(event) => updateLine(line.key, 'odometerKm', event.target.value)}
                    placeholder="Es. 260778"
                    disabled={disabled}
                    aria-describedby={`line-odometer-help-${line.key}`}
                  />
                  <small id={`line-odometer-help-${line.key}`}>Facoltativi, rilevati quando è stata eseguita l’operazione.</small>
                </label>
                <div className="expense-editor-calculations" aria-label={`Totali operazione ${index + 1}`}>
                  <span>Unitario ivato<strong>{formatEuroCents(unitIvato)}</strong></span>
                  <span>Imponibile<strong>{formatEuroCents(imponibile)}</strong></span>
                  <span>Totale ivato<strong>{formatEuroCents(totalCents)}</strong></span>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="actions-row" style={{ justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
        <button className="secondary-button" type="button" onClick={addLine} disabled={disabled}>
          <Plus size={16} aria-hidden />
          Aggiungi riga
        </button>
        <div className="expense-totals" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <span>
            Imponibile <strong>{formatEuroCents(totals.imponibile)}</strong>
          </span>
          <span>
            IVA <strong>{formatEuroCents(totals.vat)}</strong>
          </span>
          <span>
            Totale <strong>{formatEuroCents(totals.total)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
