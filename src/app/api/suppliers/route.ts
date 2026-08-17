import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSupplierInputError, supplierInputSchema } from '@/lib/supplier-form';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });

  try {
    const input = supplierInputSchema.parse(await request.json());
    const existing = await prisma.supplier.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
      select: { id: true, name: true, active: true }
    });
    if (existing) {
      const supplier = existing.active
        ? existing
        : await prisma.supplier.update({
            where: { id: existing.id },
            data: { active: true },
            select: { id: true, name: true, active: true }
          });
      return NextResponse.json({
        supplier,
        created: false,
        message: existing.active
          ? 'Il fornitore era gia presente ed e stato selezionato.'
          : 'Il fornitore era presente ma non attivo: e stato riattivato e selezionato.'
      });
    }

    const supplier = await prisma.supplier.create({
      data: input,
      select: { id: true, name: true, active: true }
    });
    return NextResponse.json({
      supplier,
      created: true,
      message: 'Fornitore creato e selezionato.'
    }, { status: 201 });
  } catch (error) {
    console.error('Creazione rapida fornitore fallita.', error instanceof Error ? { message: error.message } : { error });
    return NextResponse.json({ error: getSupplierInputError(error) }, { status: 400 });
  }
}
