import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Identificativo della versione applicativa in esecuzione. Cambia a ogni
 * ricostruzione: serve per accorgersi che la pagina aperta nel browser
 * appartiene a una versione precedente, i cui file JavaScript non esistono piu
 * sul server. Senza questo controllo la pagina resta muta: i link non navigano
 * e i pulsanti restano in attesa, anche se il salvataggio e andato a buon fine.
 */
let cachedBuildId: string | null = null;

export function getAppBuildId(): string {
  if (cachedBuildId) return cachedBuildId;
  try {
    cachedBuildId = readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    // In sviluppo il file non esiste: un valore stabile disattiva il controllo.
    cachedBuildId = 'sviluppo';
  }
  return cachedBuildId;
}
