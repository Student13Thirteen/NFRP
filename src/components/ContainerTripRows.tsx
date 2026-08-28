'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ContainerTripStopKind } from '@prisma/client';
import { GuidedChoiceField } from '@/components/GuidedChoiceField';
import { FORM_DRAFT_RESTORE_EVENT, formDraftFromEvent } from '@/lib/form-draft';

export type ContainerRowValue = {
  containerNumber?: string | null;
  containerType?: string | null;
  specification?: string | null;
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

// Tipologie previste dal foglio operativo container. Il foglio stesso chiede di
// verificare se ne esistono altre e la foto reale della LDV 002080 ha gia portato un
// `45HC`: la tendina resta percio aperta a un valore scritto a mano.
const containerTypeOptions = [
  'IMPORT 20 BOX',
  'IMPORT 40 BOX',
  'IMPORT 40 HC',
  'IMPORT 45 HC',
  'EXPORT 20 BOX',
  'EXPORT 40 BOX',
  'EXPORT 40 HC',
  'EXPORT 45 HC',
  '20 BOX',
  '40 BOX',
  '40 HC',
  '45 HC'
];

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
        values.containerSpecification?.length || 0,
        values.sealNumber?.length || 0,
        values.containerNotes?.length || 0
      );
      if (rowCount === 0) return;
      setRows(Array.from({ length: rowCount }, (_, index) => ({
        key: index,
        containerNumber: values.containerNumber?.[index] || '',
        containerType: values.containerType?.[index] || '',
        specification: values.containerSpecification?.[index] || '',
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
          <div className="container-trip-container-row" key={row.key}>
            <label className="container-trip-container-number">
              Numero container
              <input name="containerNumber" defaultValue={row.containerNumber || ''} placeholder="Es. GAOU7420942" />
            </label>
            <GuidedChoiceField
              className="container-trip-container-type"
              label="Tipo container"
              name="containerType"
              options={containerTypeOptions}
              defaultValue={row.containerType}
              restoreIndex={index}
              customLabel="Altra tipologia: scrivila"
              customPlaceholder="Es. 45HC"
            />
            <label className="container-trip-container-specification">
              Specifica
              <select name="containerSpecification" defaultValue={row.specification || ''}>
                <option value="">Nessuna</option>
                <option value="ADR">ADR</option>
                <option value="FRIGO">Frigo</option>
                <option value="ADR_FRIGO">ADR e frigo</option>
              </select>
            </label>
            <label className="container-trip-container-seal">
              Sigillo
              <input name="sealNumber" defaultValue={row.sealNumber || ''} />
            </label>
            <label className="container-trip-container-notes">
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

export function ContainerStopRows({
  defaultRows = [],
  locationSuggestions = []
}: {
  defaultRows?: ContainerStopRowValue[];
  locationSuggestions?: string[];
}) {
  const fieldsetRef = useRef<HTMLDivElement>(null);
  const [nextKey, setNextKey] = useState(defaultRows.length + 1);
  const [rows, setRows] = useState<Keyed<ContainerStopRowValue>[]>(() => (
    (defaultRows.length > 0 ? defaultRows : [{ kind: ContainerTripStopKind.DELIVERY }]).map((row, key) => ({ ...row, key }))
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
            : ContainerTripStopKind.DELIVERY,
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
            <div className="container-trip-stop-grid">
              <label className="container-trip-stop-kind">
                Tipo tappa
                <select name="stopKind" defaultValue={row.kind || ContainerTripStopKind.PICKUP}>
                  {Object.values(ContainerTripStopKind).map((kind) => (
                    <option value={kind} key={kind}>{stopKindLabels[kind]}</option>
                  ))}
                </select>
              </label>
              <GuidedChoiceField
                className="container-trip-stop-place"
                label="Azienda / luogo"
                name="stopName"
                options={locationSuggestions}
                defaultValue={row.name}
                restoreIndex={index}
                customLabel="Altro luogo: scrivilo"
                customPlaceholder="Es. ONT Magazzini Generali"
              />
              <label className="container-trip-stop-time">
                Orario previsto
                <input name="stopPlannedTime" defaultValue={row.plannedTime || ''} placeholder="Es. 12:30" />
              </label>
              <label className="container-trip-stop-address">
                Indirizzo
                <input name="stopAddress" defaultValue={row.address || ''} />
              </label>
              <label className="container-trip-stop-postal">
                CAP
                <input name="stopPostalCode" defaultValue={row.postalCode || ''} inputMode="numeric" maxLength={5} />
              </label>
              <label className="container-trip-stop-city">
                Città
                <input name="stopCity" defaultValue={row.city || ''} />
              </label>
              <label className="container-trip-stop-province">
                Provincia
                <input name="stopProvince" defaultValue={row.province || ''} maxLength={2} />
              </label>
              <label className="container-trip-stop-notes">
                Note tappa
                <input name="stopNotes" defaultValue={row.notes || ''} />
              </label>
              {rows.length > 1 ? (
                <button
                  className="secondary-button compact-button container-trip-stop-remove"
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
          setRows((current) => [...current, { key: nextKey, kind: ContainerTripStopKind.DELIVERY }]);
          setNextKey((value) => value + 1);
        }}
      >
        <Plus size={15} aria-hidden />
        Aggiungi tappa
      </button>
    </div>
  );
}
