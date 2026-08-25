import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  const { id } = await params;
  const attachment = await prisma.roadEventAttachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: 'Allegato non trovato' }, { status: 404 });
  try {
    const { fileBuffer, fileStat } = await readStoredPdf(attachment.filePath);
    const safeName = attachment.originalFileName.replace(/["\\]/g, '_');
    return new NextResponse(fileBuffer, { headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(fileStat.size),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    } });
  } catch (error) {
    console.error('Allegato verbale/sinistro non disponibile.', { attachmentId: id, error });
    return NextResponse.json({ error: 'File non disponibile' }, { status: 404 });
  }
}
