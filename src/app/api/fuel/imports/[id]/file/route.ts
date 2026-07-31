import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Non autorizzato', { status: 401 });

  const { id } = await params;
  const batch = await prisma.fuelImportBatch.findUnique({ where: { id } });
  if (!batch) return new NextResponse('PDF non trovato', { status: 404 });

  const { fileBuffer } = await readStoredPdf(batch.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': batch.mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(batch.originalFileName)}"`
    }
  });
}
