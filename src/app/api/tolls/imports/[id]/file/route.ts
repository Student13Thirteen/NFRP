import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredTollCsv } from '@/lib/toll-import';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Non autorizzato', { status: 401 });

  const { id } = await params;
  const batch = await prisma.tollImportBatch.findUnique({ where: { id } });
  if (!batch) return new NextResponse('CSV non trovato', { status: 404 });

  const { fileBuffer } = await readStoredTollCsv(batch.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': batch.mimeType || 'text/csv',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(batch.originalFileName)}"`
    }
  });
}
