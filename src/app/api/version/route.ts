import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAppBuildId } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

/**
 * Versione applicativa in esecuzione. Serve alla pagina aperta nel browser per
 * accorgersi che il gestionale e stato aggiornato nel frattempo. Resta dietro
 * la sessione come tutte le altre route: senza sessione non risponde e il
 * controllo lato pagina si limita a non fare nulla.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  return NextResponse.json(
    { buildId: getAppBuildId() },
    { headers: { 'cache-control': 'no-store' } }
  );
}
