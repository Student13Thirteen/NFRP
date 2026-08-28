'use client';

import { useEffect, useRef, useState } from 'react';
import {
  calculateContainerTripSpreadsheetMetrics,
  formatContainerRate,
  type ContainerTripSpreadsheetMetrics
} from '@/lib/container-trip-metrics';
import { FORM_DRAFT_RESTORE_EVENT } from '@/lib/form-draft';

const emptyMetrics: ContainerTripSpreadsheetMetrics = {
  actualKm: null,
  varianceKm: null,
  costPerActualKmCents: null,
  costWithAdditionalPerActualKmCents: null,
  costPerPlannedKmCents: null
};

function numericFormValue(form: HTMLFormElement, name: string): number | null {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return null;
  const value = field.value.trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyFormValue(form: HTMLFormElement, name: string): number | null {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return null;
  const value = field.value.trim();
  if (!value) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function varianceLabel(value: number | null): string {
  if (value === null) return '-';
  if (value === 0) return '0 km';
  return `${Math.abs(value).toLocaleString('it-IT')} km ${value > 0 ? 'in più' : 'in meno'}`;
}

// Il foglio operativo colloca i valori ricavati in due punti diversi: i chilometri subito
// dopo i contachilometri, gli euro/km dopo il costo viaggio e i costi aggiuntivi.
type CalculatedGroup = 'km' | 'rates';

export function ContainerTripCalculatedFields({ group }: { group: CalculatedGroup }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState(emptyMetrics);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form) return;

    const update = () => {
      setMetrics(calculateContainerTripSpreadsheetMetrics({
        plannedKm: numericFormValue(form, 'plannedKm'),
        odometerStartKm: numericFormValue(form, 'odometerStartKm'),
        odometerEndKm: numericFormValue(form, 'odometerEndKm'),
        actualKm: numericFormValue(form, 'actualKm'),
        carrierCostCents: moneyFormValue(form, 'carrierCost'),
        additionalCostCents: moneyFormValue(form, 'additionalCost')
      }));
    };

    update();
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener(FORM_DRAFT_RESTORE_EVENT, update);
    return () => {
      form.removeEventListener('input', update);
      form.removeEventListener('change', update);
      form.removeEventListener(FORM_DRAFT_RESTORE_EVENT, update);
    };
  }, []);

  return (
    <div className="container-trip-calculated" ref={rootRef} aria-live="polite">
      {group === 'km' ? (
        <>
          <div><span>Km totali viaggio (reali)</span><strong>{metrics.actualKm?.toLocaleString('it-IT') || '-'}</strong></div>
          <div><span>Differenza km previsti e reali</span><strong>{varianceLabel(metrics.varianceKm)}</strong></div>
        </>
      ) : (
        <>
          <div><span>€/km costo viaggio</span><strong>{formatContainerRate(metrics.costPerActualKmCents)}</strong></div>
          <div><span>€/km costo viaggio + aggiuntivi</span><strong>{formatContainerRate(metrics.costWithAdditionalPerActualKmCents)}</strong></div>
          <div><span>€/km previsti</span><strong>{formatContainerRate(metrics.costPerPlannedKmCents)}</strong></div>
        </>
      )}
    </div>
  );
}
