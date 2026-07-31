import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

function contentDisposition(fileName: string) {
  const safeName = fileName.replace(/["\\]/g, '_');
  return `inline; filename="${safeName}"`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Non autorizzato', { status: 401 });

  const { id } = await params;
  const batch = await prisma.tripImportBatch.findUnique({ where: { id } });
  if (!batch) return new NextResponse('PDF non trovato', { status: 404 });

  const { fileBuffer, fileStat } = await readStoredPdf(batch.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': batch.mimeType || 'application/pdf',
      'Content-Length': String(fileStat.size),
      'Content-Disposition': contentDisposition(batch.originalFileName),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    }
  });
}
