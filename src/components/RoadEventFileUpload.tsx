'use client';

import { useId, useState } from 'react';
import { Paperclip } from 'lucide-react';

type Props = { label?: string; required?: boolean };

export function RoadEventFileUpload({ label = 'Allegati (opzionali)', required = false }: Props) {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="file-upload-field">
      <span className="field-label">{label}</span>
      <input
        id={id}
        className="file-upload-input"
        name="files"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
        multiple
        required={required}
        onChange={(event) => setNames(Array.from(event.currentTarget.files || []).map((file) => file.name))}
      />
      <label className={`file-dropzone${names.length > 0 ? ' has-file' : ''}`} htmlFor={id}>
        <span className="file-dropzone-icon"><Paperclip size={21} aria-hidden /></span>
        <span className="file-dropzone-copy">
          <strong>{names.length > 0 ? `${names.length} allegati selezionati` : 'Seleziona PDF o fotografie'}</strong>
          <small>{names.length > 0 ? names.join(', ') : 'PDF, JPG, PNG o WebP; massimo 20 MB complessivi'}</small>
        </span>
      </label>
    </div>
  );
}
