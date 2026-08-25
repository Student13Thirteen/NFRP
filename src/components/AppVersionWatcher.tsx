'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type AppVersionWatcherProps = {
  buildId: string;
};

/** Controllo leggero (poche decine di byte): quando la scheda torna in primo
 *  piano e una volta al minuto mentre e in uso. */
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Avvisa quando il gestionale e stato aggiornato mentre la pagina era aperta.
 * In quel caso i file dell'applicazione a cui la pagina fa riferimento non
 * esistono piu sul server: senza ricaricare, i comandi del menu non rispondono
 * e i pulsanti di salvataggio restano in attesa anche a salvataggio riuscito.
 */
export function AppVersionWatcher({ buildId }: AppVersionWatcherProps) {
  const [outdated, setOutdated] = useState(false);

  const check = useCallback(async () => {
    if (buildId === 'sviluppo') return;
    try {
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as { buildId?: string };
      if (payload.buildId && payload.buildId !== buildId) setOutdated(true);
    } catch {
      // Rete assente o server in riavvio: non si disturba l'operatore.
    }
  }, [buildId]);

  useEffect(() => {
    if (buildId === 'sviluppo') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    // Nessun controllo immediato: al primo render la pagina arriva dal server
    // ed e per definizione allineata.
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [buildId, check]);

  if (!outdated) return null;

  return (
    <div className="app-update-banner" role="alert">
      <RefreshCw size={18} aria-hidden />
      <div>
        <strong>Il gestionale e stato aggiornato</strong>
        <span>Ricarica la pagina: finche non lo fai, salvataggi e comandi del menu possono restare in attesa.</span>
      </div>
      <button className="primary-button" type="button" onClick={() => window.location.reload()}>
        Ricarica adesso
      </button>
    </div>
  );
}
