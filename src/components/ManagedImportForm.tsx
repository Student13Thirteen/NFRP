'use client';

import { useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import {
  consumeManagedImportEvents,
  MANAGED_IMPORT_ACCEPT,
  MANAGED_IMPORT_NOTICE_KEY,
  type ManagedImportStreamEvent
} from '@/lib/managed-import';

type ManagedImportFormProps = {
  action: string;
  buttonLabel: string;
  children: React.ReactNode;
  recoveryHref?: string;
  streamProgress?: boolean;
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function ManagedImportForm({
  action,
  buttonLabel,
  children,
  recoveryHref,
  streamProgress = false
}: ManagedImportFormProps) {
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing' | 'error'>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const [processingMessage, setProcessingMessage] = useState('Estrazione dati e controlli automatici');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (typeof XMLHttpRequest === 'undefined') return;
    event.preventDefault();
    if (phase === 'uploading' || phase === 'processing') return;
    if (!event.currentTarget.reportValidity()) return;

    const xhr = new XMLHttpRequest();
    const formData = new FormData(event.currentTarget);
    let responseOffset = 0;
    let eventBuffer = '';
    let completion: Extract<ManagedImportStreamEvent, { type: 'complete' }> | null = null;
    let streamedError = '';
    setPhase('uploading');
    setPercent(0);
    setError('');
    setProcessingMessage('Estrazione dati e controlli automatici');
    xhr.open('POST', action);
    if (streamProgress) xhr.setRequestHeader('Accept', MANAGED_IMPORT_ACCEPT);

    const consumeStream = () => {
      if (!streamProgress) return;
      eventBuffer += xhr.responseText.slice(responseOffset);
      responseOffset = xhr.responseText.length;
      const consumed = consumeManagedImportEvents(eventBuffer);
      eventBuffer = consumed.remainder;

      for (const streamEvent of consumed.events) {
        if (streamEvent.type === 'progress') {
          const elapsed = streamEvent.elapsedSeconds > 0 ? ` · ${formatElapsed(streamEvent.elapsedSeconds)}` : '';
          setProcessingMessage(`${streamEvent.message}${elapsed}`);
        } else if (streamEvent.type === 'complete') {
          completion = streamEvent;
          setProcessingMessage('Analisi completata. Apertura della revisione...');
        } else {
          streamedError = streamEvent.message;
        }
      }
    };

    xhr.upload.onprogress = (progressEvent) => {
      if (!progressEvent.lengthComputable) return;
      const nextPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      setPercent(nextPercent);
      if (nextPercent >= 100) setPhase('processing');
    };
    xhr.upload.onload = () => {
      setPercent(100);
      setPhase('processing');
    };
    xhr.onprogress = consumeStream;
    xhr.onload = () => {
      consumeStream();
      if (streamedError) {
        setPhase('error');
        setError(streamedError);
        return;
      }
      if (streamProgress && xhr.status >= 200 && xhr.status < 300 && completion) {
        try {
          window.sessionStorage.setItem(
            MANAGED_IMPORT_NOTICE_KEY,
            JSON.stringify({ ...completion.notice, createdAt: Date.now() })
          );
        } catch {
          // La revisione resta comunque raggiungibile se lo storage del browser
          // e disabilitato; si perde soltanto il banner riepilogativo.
        }
        window.location.assign(completion.redirectTo);
        return;
      }
      if (!streamProgress && xhr.status >= 200 && xhr.status < 400) {
        window.location.assign(xhr.responseURL || action);
        return;
      }
      setPhase('error');
      setError(
        xhr.status === 401
          ? 'Sessione scaduta. Accedi di nuovo prima di ripetere il caricamento.'
          : streamProgress && xhr.status >= 200 && xhr.status < 300
          ? 'Il server non ha restituito l’esito finale. Controlla la revisione prima di riprovare.'
          : 'Importazione non riuscita. Controlla il file e riprova.'
      );
    };
    xhr.onerror = () => {
      setPhase('error');
      setError(
        streamProgress
          ? 'Connessione interrotta durante l’analisi. Il server potrebbe aver continuato: controlla la revisione prima di riprovare.'
          : 'Connessione interrotta durante il caricamento. Riprova.'
      );
    };
    xhr.send(formData);
  }

  const busy = phase === 'uploading' || phase === 'processing';
  return (
    <form action={action} method="post" encType="multipart/form-data" className="form-stack" onSubmit={handleSubmit}>
      {children}
      <button className="primary-button import-submit" type="submit" disabled={busy}>
        {busy ? <Loader2 size={16} aria-hidden className="spin" /> : <UploadCloud size={16} aria-hidden />}
        {phase === 'uploading' ? `Caricamento ${percent}%` : phase === 'processing' ? 'Lettura e preparazione...' : buttonLabel}
      </button>
      {busy ? (
        <div className={`managed-import-progress${phase === 'processing' ? ' is-processing' : ''}`} role="status" aria-live="polite">
          <div className="managed-import-track">
            <span style={{ width: phase === 'processing' ? '100%' : `${percent}%` }} />
          </div>
          <div>
            {phase === 'uploading' ? (
              <><UploadCloud size={15} aria-hidden /><span>Invio file al server</span><strong>{percent}%</strong></>
            ) : (
              <><Loader2 size={15} aria-hidden className="spin" /><span>{processingMessage}</span></>
            )}
          </div>
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="form-error">
          {error}
          {recoveryHref ? (
            <>
              {' '}
              <a href={recoveryHref}>Apri la revisione</a>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
