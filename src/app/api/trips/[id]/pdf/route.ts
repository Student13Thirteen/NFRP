import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateTripPdf } from '@/lib/trip-pdf';
import { tripInclude } from '@/lib/trips';

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
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: tripInclude
  });
  if (!trip) {
    return NextResponse.json({ error: 'Viaggio non trovato' }, { status: 404 });
  }

  const pdf = generateTripPdf(trip);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': contentDisposition(`viaggio-${trip.tripNumber}.pdf`),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store'
    }
  });
}
