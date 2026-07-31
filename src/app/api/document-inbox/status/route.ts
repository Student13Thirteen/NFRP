import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Stato di analisi di un insieme di item inbox (usato dalla barra di avanzamento dopo l'upload).
// Ritorna per ogni id se l'analisi automatica è completata (analyzedAt valorizzato) e lo stato corrente.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sessione scaduta.' }, { status: 401 });

  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) return NextResponse.json({ items: [] });

  const items = await prisma.documentInboxItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, analyzedAt: true, status: true }
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      analyzed: item.analyzedAt !== null,
      status: item.status
    }))
  });
}
