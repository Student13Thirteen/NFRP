'use client';

import { useState } from 'react';
import { DatePartsInput } from '@/components/DatePartsInput';

export type DocumentTypeExpiryOption = {
  id: string;
  name: string;
  active: boolean;
  expiryRequired: boolean;
};

type DocumentTypeExpiryFieldsProps = {
  documentTypes: DocumentTypeExpiryOption[];
  defaultDocumentTypeId: string;
  defaultExpiryDate?: string;
  expiryLabel?: string;
};

export function DocumentTypeExpiryFields({
  documentTypes,
  defaultDocumentTypeId,
  defaultExpiryDate,
  expiryLabel = 'Data scadenza'
}: DocumentTypeExpiryFieldsProps) {
  const [documentTypeId, setDocumentTypeId] = useState(defaultDocumentTypeId);
  const selectedType = documentTypes.find((documentType) => documentType.id === documentTypeId);
  const expiryRequired = selectedType?.expiryRequired ?? true;

  return (
    <>
      <label>
        Tipo documento
        <select
          name="documentTypeId"
          value={documentTypeId}
          onChange={(event) => setDocumentTypeId(event.target.value)}
          required
        >
          {documentTypes.map((documentType) => (
            <option key={documentType.id} value={documentType.id}>
              {documentType.name}
              {documentType.active ? '' : ' (non attivo)'}
            </option>
          ))}
        </select>
      </label>
      <DatePartsInput
        key={expiryRequired ? 'expiry-required' : 'expiry-not-required'}
        label={expiryRequired ? expiryLabel : `${expiryLabel} (non prevista)`}
        name="expiryDate"
        defaultValue={expiryRequired ? defaultExpiryDate : undefined}
        required={expiryRequired}
      />
    </>
  );
}
