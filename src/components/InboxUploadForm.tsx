'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, UploadCloud } from 'lucide-react';
import { InboxFileUpload } from './InboxFileUpload';

const POLL_INTERVAL_MS = 1500;

// Form di caricamento inbox con avanzamento in tempo reale e supporto a PIÙ upload concorrenti:
// puoi trascinare un secondo file mentre il primo è ancora in analisi e finisce comunque in coda.
// Ogni upload via XHR è veloce (l'OCR gira in background lato server); la barra mostra la fase di
// caricamento (% byte) e poi l'analisi aggregata (X/N letti). Senza JavaScript resta il POST con redirect.
export function InboxUploadForm() {
  const router = useRouter();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackedIdsRef = useRef<Set<string>>(new Set());
  const activeUploadsRef = useRef(0);

  const [activeUploads, setActiveUploads] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const ensurePolling = useCallback(() => {
    if (pollTimerRef.current) return;

    const tick = async () => {
      const ids = [...trackedIdsRef.current];
      if (ids.length === 0) {
        if (activeUploadsRef.current === 0) stopPolling();
        return;
      }
      try {
        const response = await fetch(`/api/document-inbox/status?ids=${encodeURIComponent(ids.join(','))}`, {
          headers: { accept: 'application/json' },
          cache: 'no-store'
        });
        if (!response.ok) return;
        const data: { items?: Array<{ id: string; analyzed: boolean }> } = await response.json();
        const analyzed = (data.items || []).filter((item) => item.analyzed).length;
        setAnalyzedCount(analyzed);
        router.refresh();

        if (activeUploadsRef.current === 0 && analyzed >= ids.length) {
          stopPolling();
          setJustDone(true);
          router.refresh();
          window.setTimeout(() => {
            trackedIdsRef.current = new Set();
            setAnalyzedCount(0);
            setTotalCount(0);
            setUploadPercent(0);
            setJustDone(false);
          }, 1600);
        }
      } catch {
        // errori di rete transitori: riprovo al prossimo tick
      }
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    void tick();
  }, [router, stopPolling]);

  const startUpload = useCallback(
    (form: HTMLFormElement) => {
      if (!form.reportValidity()) return;
      const formData = new FormData(form);
      setResetKey((key) => key + 1); // azzera la selezione: il prossimo drop/click parte indipendente

      activeUploadsRef.current += 1;
      setActiveUploads(activeUploadsRef.current);
      setError(null);
      setJustDone(false);
      setUploadPercent(0);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/document-inbox/upload');
      xhr.setRequestHeader('accept', 'application/json');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadPercent(Math.round((event.loaded / event.total) * 100));
      };

      const finishUpload = () => {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        setActiveUploads(activeUploadsRef.current);
      };

      xhr.onload = () => {
        let payload: { created?: string[]; duplicates?: number; error?: string } = {};
        try {
          payload = JSON.parse(xhr.responseText || '{}');
        } catch {
          // corpo non JSON gestito come errore generico
        }
        finishUpload();

        if (xhr.status < 200 || xhr.status >= 300) {
          setError(payload.error || 'Caricamento non riuscito. Riprova.');
          return;
        }

        for (const id of payload.created || []) trackedIdsRef.current.add(id);
        setTotalCount(trackedIdsRef.current.size);
        router.refresh();

        if (trackedIdsRef.current.size > 0) {
          ensurePolling();
        } else if (activeUploadsRef.current === 0) {
          setJustDone(true);
          window.setTimeout(() => setJustDone(false), 1600);
        }
      };

      xhr.onerror = () => {
        finishUpload();
        setError('Errore di rete durante il caricamento. Riprova.');
      };

      xhr.send(formData);
    },
    [ensurePolling, router]
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (typeof XMLHttpRequest === 'undefined') return; // fallback senza JS: submit nativo con redirect
      event.preventDefault();
      startUpload(event.currentTarget);
    },
    [startUpload]
  );

  const uploading = activeUploads > 0;
  const analyzing = !uploading && totalCount > analyzedCount;
  const showBar = uploading || analyzing || justDone || error !== null;
  const percent = error ? 100 : uploading ? uploadPercent : justDone ? 100 : totalCount > 0 ? Math.round((analyzedCount / totalCount) * 100) : 0;
  const label = error
    ? error
    : uploading
      ? 'Caricamento file…'
      : justDone
        ? 'Analisi completata.'
        : analyzing
          ? `Analisi documenti: ${analyzedCount}/${totalCount}`
          : '';

  return (
    <form
      action="/api/document-inbox/upload"
      method="post"
      encType="multipart/form-data"
      className="form-stack"
      onSubmit={handleSubmit}
    >
      <InboxFileUpload key={resetKey} />

      <button className="primary-button" type="submit">
        <UploadCloud size={16} aria-hidden />
        Carica e analizza
      </button>

      {showBar ? (
        <div className={`inbox-progress${error ? ' is-error' : ''}${justDone && !error ? ' is-done' : ''}`}>
          <div className="inbox-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="inbox-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="inbox-progress-label">
            {justDone && !error ? <CheckCircle2 size={15} aria-hidden /> : null}
            <span>{label}</span>
            {!error && !justDone ? <strong>{percent}%</strong> : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
