'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { DatePartsInput } from '@/components/DatePartsInput';
import { EntitySelect } from '@/components/EntitySelect';
import type { EntityOption } from '@/lib/entities';

type DocumentTypeOption = {
  id: string;
  name: string;
  active: boolean;
  defaultNoticeDays: number;
};

type StatusOption = {
  value: string;
  label: string;
};

export type InboxReplacementCandidate = {
  id: string;
  title: string;
  documentTypeId: string;
  entityKey: string;
  entityLabel: string;
  expiryDateLabel: string;
  issueDateLabel: string;
  fileName: string | null;
};

type InboxDocumentReviewFormDefaults = {
  title: string;
  documentTypeId: string;
  entityKey: string;
  issueDate: string;
  expiryDate: string;
  noticeDays: number;
  amount: string;
  status: string;
  notes: string;
};

type InboxDocumentReviewFormProps = {
  action: string;
  documentTypes: DocumentTypeOption[];
  entityOptions: EntityOption[];
  defaultValues: InboxDocumentReviewFormDefaults;
  statusOptions: StatusOption[];
  replacementCandidates: InboxReplacementCandidate[];
  defaultReplacementDocumentId?: string;
};

export function InboxDocumentReviewForm({
  action,
  documentTypes,
  entityOptions,
  defaultValues,
  statusOptions,
  replacementCandidates,
  defaultReplacementDocumentId
}: InboxDocumentReviewFormProps) {
  const [documentTypeId, setDocumentTypeId] = useState(defaultValues.documentTypeId);
  const [entityKey, setEntityKey] = useState(defaultValues.entityKey);
  const [replacementMode, setReplacementMode] = useState<'replace' | 'keep'>('replace');
  const [selectedReplacementId, setSelectedReplacementId] = useState(defaultReplacementDocumentId || '');

  const matchingCandidates = useMemo(
    () =>
      replacementCandidates.filter(
        (candidate) => candidate.documentTypeId === documentTypeId && candidate.entityKey === entityKey
      ),
    [documentTypeId, entityKey, replacementCandidates]
  );
  const hasReplacementCandidate = matchingCandidates.length > 0;
  const preferredReplacementId =
    matchingCandidates.find((candidate) => candidate.id === defaultReplacementDocumentId)?.id || matchingCandidates[0]?.id || '';
  const effectiveSelectedReplacementId = matchingCandidates.some((candidate) => candidate.id === selectedReplacementId)
    ? selectedReplacementId
    : preferredReplacementId;
  const activeReplacementId =
    hasReplacementCandidate && replacementMode === 'replace' ? effectiveSelectedReplacementId : '';
  const activeReplacement =
    matchingCandidates.find((candidate) => candidate.id === activeReplacementId) || matchingCandidates[0] || null;

  return (
    <form action={action} method="post" className="form-stack" noValidate>
      <input name="replacementMode" type="hidden" value={hasReplacementCandidate ? replacementMode : 'keep'} />
      <input name="replacementDocumentId" type="hidden" value={activeReplacementId} />
      <div className="form-grid">
        <label>
          Titolo
          <input name="title" defaultValue={defaultValues.title} />
        </label>
        <label>
          Tipo documento
          <select
            name="documentTypeId"
            defaultValue={defaultValues.documentTypeId}
            onChange={(event) => setDocumentTypeId(event.target.value)}
            required
          >
            <option value="" disabled>
              Seleziona tipo documento
            </option>
            {documentTypes.map((documentType) => (
              <option key={documentType.id} value={documentType.id}>
                {documentType.name}
                {documentType.active ? '' : ' (non attivo)'}
              </option>
            ))}
          </select>
        </label>
        <EntitySelect options={entityOptions} defaultValue={defaultValues.entityKey} onValueChange={setEntityKey} />
        <DatePartsInput label="Data emissione" name="issueDate" defaultValue={defaultValues.issueDate} />
        <DatePartsInput label="Data scadenza" name="expiryDate" defaultValue={defaultValues.expiryDate} required />
        <label>
          Giorni preavviso
          <input name="noticeDays" type="number" min={1} defaultValue={defaultValues.noticeDays} required />
        </label>
        <label>
          Stato
          <select name="status" defaultValue={defaultValues.status}>
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Costo associato (€)
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={defaultValues.amount}
            placeholder="Es. 13,00"
          />
        </label>
      </div>

      {hasReplacementCandidate && activeReplacement ? (
        <div className="renewal-choice" role="alert">
          <div className="renewal-choice-title">
            <AlertTriangle size={17} aria-hidden />
            Documento attivo gia presente
          </div>
          <p>
            Trovato {activeReplacement.title} per {activeReplacement.entityLabel}, scadenza {activeReplacement.expiryDateLabel}.
          </p>
          {matchingCandidates.length > 1 ? (
            <label>
              Documento da sostituire
              <select
                value={effectiveSelectedReplacementId}
                onChange={(event) => setSelectedReplacementId(event.target.value)}
              >
                {matchingCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title} - scade {candidate.expiryDateLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="renewal-choice-options">
            <label>
              <input
                checked={replacementMode === 'replace'}
                name="replacementModeChoice"
                onChange={() => setReplacementMode('replace')}
                type="radio"
                value="replace"
              />
              <span>
                <strong>Sostituisci e sposta il vecchio nello storico</strong>
                <small>Il documento vecchio passa a Rinnovato e non genera piu notifiche Telegram.</small>
              </span>
            </label>
            <label>
              <input
                checked={replacementMode === 'keep'}
                name="replacementModeChoice"
                onChange={() => setReplacementMode('keep')}
                type="radio"
                value="keep"
              />
              <span>
                <strong>Importa come documento aggiuntivo</strong>
                <small>Usalo solo se entrambi i documenti devono restare attivi.</small>
              </span>
            </label>
          </div>
        </div>
      ) : null}

      <label>
        Note
        <textarea name="notes" defaultValue={defaultValues.notes} placeholder="Note interne opzionali" />
      </label>
      <button className="primary-button" type="submit">
        <Save size={16} aria-hidden />
        Importa documento
      </button>
    </form>
  );
}
