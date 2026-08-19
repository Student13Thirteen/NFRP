'use client';

import { CheckCircle2, Plus, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  VAT_RATES,
  computeLineVat,
  formatEuroCents,
  formatUnitPrice,
  imponibileCentsFromUnitMilliEuro
} from '@/lib/expense-shared';
import { DATE_PARTS_VALUE_EVENT, type DatePartsValueEventDetail } from '@/lib/date-parts-events';
import type { DatedDriverAssignment } from '@/lib/driver-assignment-core';
import {
  EXPENSE_DRIVER_AUTO,
  EXPENSE_DRIVER_NONE,
  expenseDriverName,
  findAutomaticExpenseDriver,
  type ExpenseDriverOption,
  type TrailerTractorLink
} from '@/lib/expense-driver';
import { FORM_DRAFT_RESTORE_EVENT, formDraftFromEvent, recoveredFormRowKey } from '@/lib/form-draft';

export type AllocationChoice = { value: string; label: string; active?: boolean };
export type CategoryChoice = { id: string; label: string; active?: boolean };

export type ExpenseAllocationDefault = {
  quantity?: string;
  allocationKey?: string;
  odometerKm?: string;
  driverSelection?: string;
};

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
  allocations?: ExpenseAllocationDefault[];
};

type ExpenseLinesEditorProps = {
  allocations: AllocationChoice[];
  categories: CategoryChoice[];
  defaultRows?: ExpenseLineDefault[];
  disabled?: boolean;
  drivers?: ExpenseDriverOption[];
  driverAssignments?: DatedDriverAssignment[];
  trailerTractorLinks?: TrailerTractorLink[];
  allocationDate?: string;
  vehicleAllocationRequired?: boolean;
  warehouseOrVehicleRequired?: boolean;
};

type EditableAllocation = {
  key: string;
  quantity: string;
  allocationKey: string;
  odometerKm: string;
  driverSelection: string;
};

type EditableLine = {
  key: string;
  description: string;
  code: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  categoryId: string;
  allocations: EditableAllocation[];
};

type EditableLineField = Exclude<keyof EditableLine, 'key' | 'allocations'>;

function defaultAllocation(
  lineKey: string,
  quantity: string,
  allocationKey: string,
  odometerKm = '',
  driverSelection = EXPENSE_DRIVER_AUTO
): EditableAllocation {
  return { key: `${lineKey}-allocation-0`, quantity, allocationKey, odometerKm, driverSelection };
}

function emptyLine(key: string): EditableLine {
  return {
    key,
    description: '',
    code: '',
    quantity: '1',
    unit: 'pz',
    unitPrice: '',
    vatRate: '22',
    categoryId: '',
    allocations: [defaultAllocation(key, '1', 'GENERIC')]
  };
}

function buildInitialLines(defaultRows: ExpenseLineDefault[] | undefined): EditableLine[] {
  if (!defaultRows || defaultRows.length === 0) return [emptyLine('line-0')];
  return defaultRows.map((row, index) => {
    const key = `line-${index}`;
    const quantity = row.quantity ?? '1';
    const allocationRows = row.allocations?.length
      ? row.allocations
      : [{ quantity, allocationKey: row.allocationKey, odometerKm: row.odometerKm }];
    return {
      key,
      description: row.description ?? '',
      code: row.code ?? '',
      quantity,
      unit: row.unit ?? 'pz',
      unitPrice: (row.unitPrice ?? '').replace(/,/g, '.'),
      vatRate: row.vatRate ?? '22',
      categoryId: row.categoryId ?? '',
      allocations: allocationRows.map((allocation, allocationIndex) => ({
        key: `${key}-allocation-${allocationIndex}`,
        quantity: allocation.quantity ?? quantity,
        allocationKey: allocation.allocationKey ?? 'GENERIC',
        odometerKm: allocation.odometerKm ?? '',
        driverSelection: allocation.driverSelection ?? EXPENSE_DRIVER_AUTO
      }))
    };
  });
}

/** Convenzione manuale condivisa con Rifornimenti: punto decimale, niente separatore migliaia. */
function toNumber(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toQuantityMilli(value: string): number {
  return Math.round(toNumber(value || '0') * 1000);
}

function fromQuantityMilli(value: number): string {
  return (Math.max(0, value) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function lineUnitPriceMilliEuro(line: EditableLine): number {
  return Math.round(toNumber(line.unitPrice || '0') * 1000);
}

function lineImponibileCents(line: EditableLine): number {
  return imponibileCentsFromUnitMilliEuro(toQuantityMilli(line.quantity), lineUnitPriceMilliEuro(line));
}

function allocationTotalMilli(line: EditableLine): number {
  return line.allocations.reduce((sum, allocation) => sum + toQuantityMilli(allocation.quantity), 0);
}

export function ExpenseLinesEditor({
  allocations,
  categories,
  defaultRows,
  disabled = false,
  drivers = [],
  driverAssignments = [],
  trailerTractorLinks = [],
  allocationDate = '',
  vehicleAllocationRequired = false,
  warehouseOrVehicleRequired = false
}: ExpenseLinesEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const allocationRequired = vehicleAllocationRequired || warehouseOrVehicleRequired;
  const allocationIsAllowed = (value: string) =>
    value.startsWith('TRACTOR:') ||
    value.startsWith('TRAILER:') ||
    (warehouseOrVehicleRequired && value === 'WAREHOUSE');
  const initialLines = buildInitialLines(defaultRows);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialLines.map((line) => ({
      ...line,
      allocations: line.allocations.map((allocation) => ({
        ...allocation,
        allocationKey: allocationRequired && !allocationIsAllowed(allocation.allocationKey)
          ? ''
          : allocation.allocationKey
      }))
    }))
  );
  const [bulkAllocation, setBulkAllocation] = useState('');
  const [effectiveAllocationDate, setEffectiveAllocationDate] = useState(allocationDate);
  const nextLineKey = useRef(initialLines.length);
  const nextAllocationKey = useRef(initialLines.reduce((sum, line) => sum + line.allocations.length, 0));
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

  function updateLine(key: string, field: EditableLineField, value: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const normalizedValue = field === 'unitPrice' ? value.replace(/,/g, '.') : value;
      if (field === 'quantity' && line.allocations.length === 1) {
        return { ...line, quantity: normalizedValue, allocations: [{ ...line.allocations[0], quantity: normalizedValue }] };
      }
      return { ...line, [field]: normalizedValue };
    }));
  }

  function updateAllocation(lineKey: string, allocationKey: string, field: keyof EditableAllocation, value: string) {
    setLines((current) => current.map((line) => line.key !== lineKey ? line : {
      ...line,
      allocations: line.allocations.map((allocation) => allocation.key !== allocationKey ? allocation : {
        ...allocation,
        [field]: value,
        ...(field === 'allocationKey'
          ? {
              driverSelection: EXPENSE_DRIVER_AUTO,
              ...(value === 'WAREHOUSE' || value === 'GENERIC' ? { odometerKm: '' } : {})
            }
          : {})
      })
    }));
  }

  function addLine() {
    const key = `line-${nextLineKey.current}`;
    nextLineKey.current += 1;
    const line = emptyLine(key);
    if (allocationRequired) line.allocations[0].allocationKey = '';
    setLines((current) => [...current, line]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  function splitLine(lineKey: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey) return line;
      const candidates = line.allocations
        .map((allocation, index) => ({ index, quantityMilli: toQuantityMilli(allocation.quantity) }))
        .filter((candidate) => candidate.quantityMilli > 1)
        .sort((left, right) => right.quantityMilli - left.quantityMilli || left.index - right.index);
      const source = candidates[0];
      if (!source) return line;

      const newQuantityMilli = source.quantityMilli >= 2000 ? 1000 : Math.floor(source.quantityMilli / 2);
      const sourceAllocation = line.allocations[source.index];
      const newAllocation: EditableAllocation = {
        key: `${line.key}-allocation-${nextAllocationKey.current}`,
        quantity: fromQuantityMilli(newQuantityMilli),
        allocationKey: allocationRequired ? '' : sourceAllocation.allocationKey,
        odometerKm: '',
        driverSelection: EXPENSE_DRIVER_AUTO
      };
      nextAllocationKey.current += 1;

      return {
        ...line,
        allocations: [
          ...line.allocations.slice(0, source.index),
          { ...sourceAllocation, quantity: fromQuantityMilli(source.quantityMilli - newQuantityMilli) },
          ...line.allocations.slice(source.index + 1),
          newAllocation
        ]
      };
    }));
  }

  function removeAllocation(lineKey: string, allocationKey: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== lineKey || line.allocations.length <= 1) return line;
      const removed = line.allocations.find((allocation) => allocation.key === allocationKey);
      const remaining = line.allocations.filter((allocation) => allocation.key !== allocationKey);
      if (!removed || remaining.length === 0) return line;
      return {
        ...line,
        allocations: remaining.map((allocation, index) => index === 0
          ? { ...allocation, quantity: fromQuantityMilli(toQuantityMilli(allocation.quantity) + toQuantityMilli(removed.quantity)) }
          : allocation)
      };
    }));
  }

  function applyAllocationToAll(value: string) {
    setBulkAllocation(value);
    if (!value) return;
    setLines((current) => current.map((line) => ({
      ...line,
      allocations: line.allocations.map((allocation) => ({
        ...allocation,
        allocationKey: value,
        driverSelection: EXPENSE_DRIVER_AUTO,
        ...(value === 'WAREHOUSE' || value === 'GENERIC' ? { odometerKm: '' } : {})
      }))
    })));
  }

  const totals = useMemo(() => lines.reduce(
    (acc, line) => {
      const imponibile = lineImponibileCents(line);
      const { vatCents, totalCents } = computeLineVat(imponibile, Number(line.vatRate) || 0);
      return { imponibile: acc.imponibile + imponibile, vat: acc.vat + vatCents, total: acc.total + totalCents };
    },
    { imponibile: 0, vat: 0, total: 0 }
  ), [lines]);

  const lineIsComplete = (line: EditableLine) =>
    allocationTotalMilli(line) === toQuantityMilli(line.quantity) &&
    line.allocations.every((allocation) =>
      toQuantityMilli(allocation.quantity) > 0 && (!allocationRequired || allocationIsAllowed(allocation.allocationKey))
    );
  const assignedLines = lines.filter(lineIsComplete).length;

  useEffect(() => {
    const form = editorRef.current?.closest('form');
    if (!form) return;

    const dateValue = (name: string, override?: DatePartsValueEventDetail) => {
      if (override?.name === name) return override.value;
      return (form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value || '';
    };
    const refreshDate = (detail?: DatePartsValueEventDetail) => {
      setEffectiveAllocationDate(
        dateValue('reviewDocumentDate', detail) ||
        dateValue('documentDate', detail) ||
        dateValue('registeredAt', detail) ||
        allocationDate
      );
    };
    const handleDateChange = (event: Event) => {
      refreshDate((event as CustomEvent<DatePartsValueEventDetail>).detail);
    };

    refreshDate();
    form.addEventListener(DATE_PARTS_VALUE_EVENT, handleDateChange);
    return () => form.removeEventListener(DATE_PARTS_VALUE_EVENT, handleDateChange);
  }, [allocationDate]);

  useEffect(() => {
    const form = editorRef.current?.closest('form');
    if (!form) return;
    const restore = (event: Event) => {
      const values = formDraftFromEvent(event)?.values;
      const lineKeys = values?.lineKey;
      if (!values || !lineKeys?.length) return;

      const recoveredLines = lineKeys.map((lineKey, lineIndex): EditableLine => {
        // Le chiavi salvate possono essere sparse dopo l'eliminazione di una riga.
        // Le rinumeriamo al ripristino per non riutilizzare una chiave React gia presente.
        const recoveredLineKey = recoveredFormRowKey('line', lineIndex);
        const allocationIndexes = (values.lineAllocationLineKey || [])
          .map((key, index) => key === lineKey ? index : -1)
          .filter((index) => index >= 0);
        const quantity = values.lineQuantity?.[lineIndex] || '1';
        const recoveredAllocations = allocationIndexes.length > 0
          ? allocationIndexes.map((allocationIndex, index) => {
              const recoveredAllocationKey = values.lineAllocationKey?.[allocationIndex] || 'GENERIC';
              const recoveredAllocationIsAllowed =
                recoveredAllocationKey.startsWith('TRACTOR:') ||
                recoveredAllocationKey.startsWith('TRAILER:') ||
                (warehouseOrVehicleRequired && recoveredAllocationKey === 'WAREHOUSE');
              return {
                key: `${recoveredLineKey}-recovered-allocation-${index}`,
                quantity: values.lineAllocationQuantity?.[allocationIndex] || quantity,
                allocationKey: allocationRequired && !recoveredAllocationIsAllowed ? '' : recoveredAllocationKey,
                odometerKm: values.lineAllocationOdometerKm?.[allocationIndex] || '',
                driverSelection: values.lineAllocationDriverSelection?.[allocationIndex] || EXPENSE_DRIVER_AUTO
              };
            })
          : [defaultAllocation(recoveredLineKey, quantity, allocationRequired ? '' : 'GENERIC')];

        return {
          key: recoveredLineKey,
          description: values.lineDescription?.[lineIndex] || '',
          code: values.lineCode?.[lineIndex] || '',
          quantity,
          unit: values.lineUnit?.[lineIndex] || 'pz',
          unitPrice: (values.lineUnitPrice?.[lineIndex] || '').replace(/,/g, '.'),
          vatRate: values.lineVatRate?.[lineIndex] || '22',
          categoryId: values.lineCategoryId?.[lineIndex] || '',
          allocations: recoveredAllocations
        };
      });

      setLines(recoveredLines);
      setBulkAllocation('');
      nextLineKey.current = recoveredLines.length;
      nextAllocationKey.current = recoveredLines.reduce((sum, line) => sum + line.allocations.length, 0);
    };
    form.addEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
    return () => form.removeEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
  }, [allocationRequired, warehouseOrVehicleRequired]);

  return (
    <div className="expense-lines" ref={editorRef}>
      {allocationRequired ? (
        <section className={`maintenance-allocation-prompt${assignedLines === lines.length ? ' complete' : ''}`}>
          <span className="maintenance-allocation-icon" aria-hidden>
            {assignedLines === lines.length ? <CheckCircle2 size={22} /> : <Wrench size={22} />}
          </span>
          <div className="maintenance-allocation-copy">
            <strong>{warehouseOrVehicleRequired ? 'Assegna quantità a Magazzino e mezzi' : 'Assegna le operazioni ai mezzi'}</strong>
            <span>
              {assignedLines} di {lines.length} righe complete.{' '}
              {warehouseOrVehicleRequired
                ? 'Se la stessa riga serve più destinazioni, usa “Ripartisci quantità”: il totale assegnato deve coincidere con quello fatturato.'
                : 'Usa l’assegnazione rapida oppure scegli targhe diverse sulle singole operazioni.'}
            </span>
          </div>
          <label>
            {warehouseOrVehicleRequired ? 'Applica una destinazione a tutte le quote' : 'Applica una targa a tutte'}
            <select value={bulkAllocation} onChange={(event) => applyAllocationToAll(event.target.value)} disabled={disabled}>
              <option value="">{warehouseOrVehicleRequired ? 'Seleziona destinazione…' : 'Seleziona mezzo…'}</option>
              {(warehouseOrVehicleRequired ? requiredAllocations : vehicleAllocations).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <p className="muted expense-decimal-hint">
        Per quantità e prezzi usa il <strong>punto</strong> come separatore decimale, senza separatore delle migliaia
        (es. prezzo <strong>3.312</strong>).
      </p>

      <div className="expense-editor-list">
        {lines.map((line, index) => {
          const imponibile = lineImponibileCents(line);
          const vatRate = Number(line.vatRate) || 0;
          const unitIvatoMilliEuro = Math.round(lineUnitPriceMilliEuro(line) * (100 + vatRate) / 100);
          const { totalCents } = computeLineVat(imponibile, vatRate);
          const assignedMilli = allocationTotalMilli(line);
          const lineQuantityMilli = toQuantityMilli(line.quantity);
          const allocationMatches = assignedMilli === lineQuantityMilli;
          const canSplit = line.allocations.some((allocation) => toQuantityMilli(allocation.quantity) > 1);

          return (
            <section className="expense-editor-row" key={line.key}>
              <input type="hidden" name="lineKey" value={line.key} />
              <div className="expense-editor-row-head">
                <strong>Operazione {index + 1}</strong>
                {lines.length > 1 ? (
                  <button type="button" className="icon-button" onClick={() => removeLine(line.key)} disabled={disabled}
                    aria-label={`Rimuovi operazione ${index + 1}`} title="Rimuovi operazione">
                    <Trash2 size={16} aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="expense-editor-fields">
                <label className="expense-field-description">
                  Descrizione
                  <input name="lineDescription" value={line.description}
                    onChange={(event) => updateLine(line.key, 'description', event.target.value)}
                    placeholder="Es. Filtro olio, manodopera…" disabled={disabled} />
                </label>
                <label>
                  Codice
                  <input name="lineCode" value={line.code}
                    onChange={(event) => updateLine(line.key, 'code', event.target.value)} disabled={disabled} />
                </label>
                <label>
                  Quantità fatturata
                  <input name="lineQuantity" inputMode="decimal" value={line.quantity}
                    onChange={(event) => updateLine(line.key, 'quantity', event.target.value)} disabled={disabled} />
                </label>
                <label>
                  Unità
                  <input name="lineUnit" value={line.unit}
                    onChange={(event) => updateLine(line.key, 'unit', event.target.value)} disabled={disabled} />
                </label>
                <label>
                  Prezzo unitario netto
                  <input name="lineUnitPrice" inputMode="decimal" value={line.unitPrice}
                    onChange={(event) => updateLine(line.key, 'unitPrice', event.target.value)} placeholder="0.000" disabled={disabled} />
                </label>
                <label>
                  IVA
                  <select name="lineVatRate" value={line.vatRate}
                    onChange={(event) => updateLine(line.key, 'vatRate', event.target.value)} disabled={disabled}>
                    {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                  </select>
                </label>
              </div>

              <div className="expense-editor-assignment">
                <label>
                  Categoria
                  <select name="lineCategoryId" value={line.categoryId}
                    onChange={(event) => updateLine(line.key, 'categoryId', event.target.value)} disabled={disabled}>
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}{category.active === false ? ' (non attiva)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="expense-allocation-heading">
                  <div>
                    <strong>{warehouseOrVehicleRequired ? 'Ripartizione quantità' : 'Destinazione'}</strong>
                    {warehouseOrVehicleRequired ? (
                      <small className={allocationMatches ? 'allocation-total-ok' : 'allocation-total-error'} aria-live="polite">
                        Assegnate {fromQuantityMilli(assignedMilli)} di {fromQuantityMilli(lineQuantityMilli)} {line.unit}
                      </small>
                    ) : null}
                  </div>
                  {warehouseOrVehicleRequired ? (
                    <button className="secondary-button compact-button" type="button" onClick={() => splitLine(line.key)}
                      disabled={disabled || !canSplit}>
                      <Plus size={15} aria-hidden />
                      Ripartisci quantità
                    </button>
                  ) : null}
                </div>

                <div className="expense-allocation-list">
                  {line.allocations.map((allocation, allocationIndex) => {
                    const isVehicleAllocation = allocation.allocationKey.startsWith('TRACTOR:') || allocation.allocationKey.startsWith('TRAILER:');
                    const automaticAssignment = findAutomaticExpenseDriver(
                      driverAssignments,
                      trailerTractorLinks,
                      allocation.allocationKey,
                      effectiveAllocationDate
                    );
                    const automaticDriverLabel = automaticAssignment?.driver
                      ? expenseDriverName(automaticAssignment.driver)
                      : 'nessun autista associato alla data';

                    return (
                    <div className="expense-allocation-row" key={allocation.key}>
                      <input type="hidden" name="lineAllocationLineKey" value={line.key} />
                      <input
                        type="hidden"
                        name="lineAllocationDriverSelection"
                        value={isVehicleAllocation ? allocation.driverSelection : EXPENSE_DRIVER_NONE}
                      />
                      <label>
                        Quantità assegnata
                        <input name="lineAllocationQuantity" inputMode="decimal" min="0.001" step="0.001" required
                          value={allocation.quantity}
                          onChange={(event) => updateAllocation(line.key, allocation.key, 'quantity', event.target.value)}
                          disabled={disabled} />
                      </label>
                      <label className="expense-field-allocation">
                        {warehouseOrVehicleRequired ? 'Magazzino o targa' : vehicleAllocationRequired ? 'Targa' : 'Allocazione'}
                        <select name="lineAllocationKey" value={allocation.allocationKey}
                          onChange={(event) => updateAllocation(line.key, allocation.key, 'allocationKey', event.target.value)}
                          disabled={disabled} required={allocationRequired}>
                          {allocationRequired && !allocationIsAllowed(allocation.allocationKey) ? (
                            <option value="" disabled>
                              {warehouseOrVehicleRequired ? 'Seleziona Magazzino o targa…' : 'Seleziona targa…'}
                            </option>
                          ) : null}
                          {(allocationRequired ? requiredAllocations : allocations).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}{option.active === false ? ' (non attivo)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="expense-field-odometer">
                        Km del mezzo
                        <input name="lineAllocationOdometerKm" type="number" inputMode="numeric" min={0} max={9999999} step={1}
                          value={allocation.odometerKm}
                          onChange={(event) => updateAllocation(line.key, allocation.key, 'odometerKm', event.target.value)}
                          placeholder="Es. 260778" disabled={disabled || allocation.allocationKey === 'WAREHOUSE'} />
                      </label>
                      {isVehicleAllocation ? (
                        <label className="expense-field-driver">
                          Autista
                          <select
                            value={allocation.driverSelection}
                            onChange={(event) => updateAllocation(
                              line.key,
                              allocation.key,
                              'driverSelection',
                              event.target.value
                            )}
                            disabled={disabled}
                          >
                            <option value={EXPENSE_DRIVER_AUTO}>Automatico: {automaticDriverLabel}</option>
                            <option value={EXPENSE_DRIVER_NONE}>Nessun autista</option>
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.label}{driver.active === false ? ' (non attivo)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {line.allocations.length > 1 ? (
                        <button type="button" className="icon-button expense-allocation-remove"
                          onClick={() => removeAllocation(line.key, allocation.key)} disabled={disabled}
                          aria-label={`Rimuovi destinazione ${allocationIndex + 1}`} title="Rimuovi destinazione">
                          <Trash2 size={16} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    );
                  })}
                </div>

                {!allocationMatches ? (
                  <p className="form-error expense-allocation-error">
                    Correggi le quantità: la somma delle destinazioni deve essere {fromQuantityMilli(lineQuantityMilli)} {line.unit}.
                  </p>
                ) : null}

                <div className="expense-editor-calculations" aria-label={`Totali operazione ${index + 1}`}>
                  <span>Unitario ivato<strong>{formatUnitPrice(unitIvatoMilliEuro)}</strong></span>
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
          <span>Imponibile <strong>{formatEuroCents(totals.imponibile)}</strong></span>
          <span>IVA <strong>{formatEuroCents(totals.vat)}</strong></span>
          <span>Totale <strong>{formatEuroCents(totals.total)}</strong></span>
        </div>
      </div>
    </div>
  );
}
