import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

function safeFileName(value: string): string {
  return value.replace(/["\r\n]/g, '').slice(0, 140) || 'documento.pdf';
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Non autorizzato', { status: 401 });

  const { id } = await params;
  const item = await prisma.documentInboxItem.findUnique({ where: { id } });
  if (!item) return new NextResponse('File non trovato', { status: 404 });

  const { fileBuffer, fileStat } = await readStoredPdf(item.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': item.mimeType || 'application/pdf',
      'Content-Length': String(fileStat.size),
      'Content-Disposition': `inline; filename="${safeFileName(item.originalFileName)}"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
