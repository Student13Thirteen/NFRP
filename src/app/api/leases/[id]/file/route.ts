import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readStoredPdf } from '@/lib/files';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { id } = await params;
  const contract = await prisma.leaseContract.findUnique({
    where: { id },
    select: { id: true, filePath: true, originalFileName: true }
  });
  if (!contract) return NextResponse.json({ error: 'Contratto non trovato' }, { status: 404 });
  if (!contract.filePath || !contract.originalFileName) {
    return NextResponse.json({ error: 'PDF non disponibile' }, { status: 404 });
  }

  try {
    const { fileBuffer, fileStat } = await readStoredPdf(contract.filePath);
    const safeName = contract.originalFileName.replace(/["\\]/g, '_');
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `inline; filename="${safeName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('PDF leasing non disponibile.', { leaseContractId: contract.id, error });
    return NextResponse.json({ error: 'File non disponibile' }, { status: 404 });
  }
}
