'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ContainerTripStopKind } from '@prisma/client';
import { FORM_DRAFT_RESTORE_EVENT, formDraftFromEvent } from '@/lib/form-draft';

export type ContainerRowValue = {
  containerNumber?: string | null;
  containerType?: string | null;
  sealNumber?: string | null;
  notes?: string | null;
};

export type ContainerStopRowValue = {
  kind?: ContainerTripStopKind;
  name?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  plannedTime?: string | null;
  notes?: string | null;
};

type Keyed<T> = T & { key: number };

const stopKindLabels: Record<ContainerTripStopKind, string> = {
  PICKUP: 'Presa / ritiro',
  DELIVERY: 'Consegna',
  TERMINAL: 'Terminal',
  CUSTOMS: 'Dogana',
  OTHER: 'Altra tappa'
};

export function ContainerRows({ defaultRows = [] }: { defaultRows?: ContainerRowValue[] }) {
  const fieldsetRef = useRef<HTMLDivElement>(null);
  const [nextKey, setNextKey] = useState(defaultRows.length + 1);
  const [rows, setRows] = useState<Keyed<ContainerRowValue>[]>(() => (
    (defaultRows.length > 0 ? defaultRows : [{}]).map((row, key) => ({ ...row, key }))
  ));

  useEffect(() => {
    const form = fieldsetRef.current?.closest('form');
    if (!form) return;
    const restore = (event: Event) => {
      const values = formDraftFromEvent(event)?.values;
      if (!values) return;
      const rowCount = Math.max(
        values.containerNumber?.length || 0,
        values.containerType?.length || 0,
        values.sealNumber?.length || 0,
        values.containerNotes?.length || 0
      );
      if (rowCount === 0) return;
      setRows(Array.from({ length: rowCount }, (_, index) => ({
        key: index,
        containerNumber: values.containerNumber?.[index] || '',
        containerType: values.containerType?.[index] || '',
        sealNumber: values.sealNumber?.[index] || '',
        notes: values.containerNotes?.[index] || ''
      })));
      setNextKey(rowCount + 1);
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
              Numero container
              <input name="containerNumber" defaultValue={row.containerNumber || ''} placeholder="Es. GAOU7420942" />
            </label>
            <label>
              Tipo
              <input name="containerType" defaultValue={row.containerType || ''} placeholder="Es. 40HC" />
            </label>
            <label>
              Sigillo
              <input name="sealNumber" defaultValue={row.sealNumber || ''} />
            </label>
            <label>
              Note
              <input name="containerNotes" defaultValue={row.notes || ''} />
            </label>
            {rows.length > 1 ? (
              <button
                className="secondary-button compact-button trip-product-remove"
                type="button"
                aria-label={`Rimuovi container ${index + 1}`}
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            ) : <span className="trip-product-remove-spacer" aria-hidden />}
          </div>
        ))}
      </div>
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={() => {
          setRows((current) => [...current, { key: nextKey }]);
          setNextKey((value) => value + 1);
        }}
      >
        <Plus size={15} aria-hidden />
        Aggiungi container
      </button>
    </div>
  );
}

export function ContainerStopRows({ defaultRows = [] }: { defaultRows?: ContainerStopRowValue[] }) {
  const fieldsetRef = useRef<HTMLDivElement>(null);
  const [nextKey, setNextKey] = useState(defaultRows.length + 1);
  const [rows, setRows] = useState<Keyed<ContainerStopRowValue>[]>(() => (
    (defaultRows.length > 0 ? defaultRows : [{ kind: ContainerTripStopKind.PICKUP }]).map((row, key) => ({ ...row, key }))
  ));

  useEffect(() => {
    const form = fieldsetRef.current?.closest('form');
    if (!form) return;
    const restore = (event: Event) => {
      const values = formDraftFromEvent(event)?.values;
      if (!values) return;
      const rowCount = Math.max(
        values.stopKind?.length || 0,
        values.stopName?.length || 0,
        values.stopAddress?.length || 0,
        values.stopCity?.length || 0
      );
      if (rowCount === 0) return;
      setRows(Array.from({ length: rowCount }, (_, index) => {
        const recoveredKind = values.stopKind?.[index] as ContainerTripStopKind | undefined;
        return {
          key: index,
          kind: recoveredKind && Object.values(ContainerTripStopKind).includes(recoveredKind)
            ? recoveredKind
            : ContainerTripStopKind.PICKUP,
          name: values.stopName?.[index] || '',
          address: values.stopAddress?.[index] || '',
          postalCode: values.stopPostalCode?.[index] || '',
          city: values.stopCity?.[index] || '',
          province: values.stopProvince?.[index] || '',
          plannedTime: values.stopPlannedTime?.[index] || '',
          notes: values.stopNotes?.[index] || ''
        };
      }));
      setNextKey(rowCount + 1);
    };
    form.addEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
    return () => form.removeEventListener(FORM_DRAFT_RESTORE_EVENT, restore);
  }, []);

  return (
    <div className="trip-product-fieldset" ref={fieldsetRef}>
      <div className="trip-product-list">
        {rows.map((row, index) => (
          <div className="panel" key={row.key} style={{ padding: 14 }}>
            <div className="form-grid">
              <label>
                Tipo tappa
                <select name="stopKind" defaultValue={row.kind || ContainerTripStopKind.PICKUP}>
                  {Object.values(ContainerTripStopKind).map((kind) => (
                    <option value={kind} key={kind}>{stopKindLabels[kind]}</option>
                  ))}
                </select>
              </label>
              <label>
                Azienda / luogo
                <input name="stopName" defaultValue={row.name || ''} placeholder="Es. ONT Magazzini Generali" />
              </label>
              <label>
                Orario previsto
                <input name="stopPlannedTime" defaultValue={row.plannedTime || ''} placeholder="Es. 12:30" />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Indirizzo
                <input name="stopAddress" defaultValue={row.address || ''} />
              </label>
              <label>
                CAP
                <input name="stopPostalCode" defaultValue={row.postalCode || ''} inputMode="numeric" />
              </label>
              <label>
                Citta
                <input name="stopCity" defaultValue={row.city || ''} />
              </label>
              <label>
                Provincia
                <input name="stopProvince" defaultValue={row.province || ''} maxLength={2} />
              </label>
            </div>
            <div className="actions-row">
              <label style={{ flex: 1 }}>
                Note tappa
                <input name="stopNotes" defaultValue={row.notes || ''} />
              </label>
              {rows.length > 1 ? (
                <button
                  className="secondary-button compact-button"
                  type="button"
                  aria-label={`Rimuovi tappa ${index + 1}`}
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                >
                  <Trash2 size={15} aria-hidden />
                  Rimuovi
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={() => {
          setRows((current) => [...current, { key: nextKey, kind: ContainerTripStopKind.PICKUP }]);
          setNextKey((value) => value + 1);
        }}
      >
        <Plus size={15} aria-hidden />
        Aggiungi tappa
      </button>
    </div>
  );
}
