import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function contentDisposition(fileName: string) {
  const safeName = fileName.replace(/["\\]/g, '_');
  return `inline; filename="${safeName}"`;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.warehouseItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: 'Record magazzino non trovato' }, { status: 404 });
  }
  if (!item.filePath || !item.originalFileName) {
    return NextResponse.json({ error: 'PDF non ancora caricato' }, { status: 404 });
  }

  try {
    const { fileBuffer, fileStat } = await readStoredPdf(item.filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(fileStat.size),
        'Content-Disposition': contentDisposition(item.originalFileName),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('Unable to read stored warehouse PDF', { warehouseItemId: item.id, error });
    return NextResponse.json({ error: 'File non disponibile' }, { status: 404 });
  }
}
