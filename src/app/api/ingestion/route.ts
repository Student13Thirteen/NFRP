import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextRequest } from 'next/server';
import { createInboxItemsFromFiles } from '@/lib/document-inbox';
import { getOptionalEnv } from '@/lib/env';
import { importExpensePdfFiles } from '@/lib/expense-import';
import { importFuelPdfFiles } from '@/lib/fuel-import';
import { importLeasePdfFiles } from '@/lib/lease-import';
import { importSmartInvoicePdfFiles } from '@/lib/smart-invoice-import';
import { importTollCsvFiles } from '@/lib/toll-import';
import { importTripWaybillPdfFiles } from '@/lib/trip-import';

export const dynamic = 'force-dynamic';

const INGESTION_KINDS = ['document', 'expense', 'maintenance', 'invoice', 'lease', 'fuel', 'toll', 'trip'] as const;
type IngestionKind = (typeof INGESTION_KINDS)[number];

function isAuthorized(request: NextRequest, configuredToken: string): boolean {
  const authorization = request.headers.get('authorization') || '';
  const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!providedToken || providedToken.length !== configuredToken.length) return false;
  return timingSafeEqual(Buffer.from(providedToken), Buffer.from(configuredToken));
}

export async function POST(request: NextRequest) {
  const configuredToken = getOptionalEnv('INGESTION_API_TOKEN');
  if (!configuredToken) {
    return Response.json({ error: 'Automazione in ingresso non configurata.' }, { status: 503 });
  }
  if (!isAuthorized(request, configuredToken)) {
    return Response.json({ error: 'Non autorizzato.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const kindValue = String(formData.get('kind') || '').toLowerCase();
    if (!INGESTION_KINDS.includes(kindValue as IngestionKind)) {
      return Response.json({ error: 'Tipo non valido.', acceptedKinds: INGESTION_KINDS }, { status: 400 });
    }
    const kind = kindValue as IngestionKind;
    const files = formData.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
    const splitEveryPage = ['1', 'true', 'on'].includes(String(formData.get('splitPages') || '').toLowerCase());
    if (files.length === 0) return Response.json({ error: 'Nessun file ricevuto.' }, { status: 400 });

    if (kind === 'document') {
      const result = await createInboxItemsFromFiles(files, { splitEveryPage });
      revalidatePath('/acquisitions');
      revalidatePath('/documents/inbox');
      return Response.json({
        kind,
        receivedFiles: files.length,
        createdItems: result.items.length,
        duplicates: result.duplicateItems,
        expandedPages: result.expandedPages,
        reviewUrl: '/documents/inbox'
      });
    }

    if (kind === 'expense' || kind === 'maintenance') {
      const result = await importExpensePdfFiles(files, kind === 'maintenance' ? 'MAINTENANCE' : 'EXPENSE');
      revalidatePath('/acquisitions');
      revalidatePath('/maintenances/expenses');
      revalidatePath('/maintenances/expenses/review');
      return Response.json({ kind, ...result, reviewUrl: '/maintenances/expenses/review' });
    }

    if (kind === 'invoice') {
      const result = await importSmartInvoicePdfFiles(files);
      revalidatePath('/acquisitions');
      revalidatePath('/fuel');
      revalidatePath('/fuel/import/review');
      revalidatePath('/maintenances/expenses');
      revalidatePath('/maintenances/expenses/review');
      return Response.json({ kind, ...result, reviewUrl: '/acquisitions' });
    }

    if (kind === 'lease') {
      const result = await importLeasePdfFiles(files);
      revalidatePath('/acquisitions');
      revalidatePath('/leases');
      revalidatePath('/leases/import/review');
      revalidatePath('/maintenances/expenses/review');
      return Response.json({
        kind,
        ...result,
        reviewUrl: result.importedContracts > 0 ? '/leases/import/review' : '/maintenances/expenses/review'
      });
    }

    if (kind === 'fuel') {
      const result = await importFuelPdfFiles(files);
      revalidatePath('/acquisitions');
      revalidatePath('/fuel');
      revalidatePath('/fuel/import/review');
      return Response.json({ kind, ...result, reviewUrl: '/fuel/import/review' });
    }

    if (kind === 'toll') {
      const result = await importTollCsvFiles(files);
      revalidatePath('/acquisitions');
      revalidatePath('/tolls');
      revalidatePath('/tolls/import/review');
      return Response.json({ kind, ...result, reviewUrl: '/tolls/import/review' });
    }

    const result = await importTripWaybillPdfFiles(files);
    revalidatePath('/acquisitions');
    revalidatePath('/trips');
    revalidatePath('/trips/container');
    revalidatePath('/trips/import/review');
    return Response.json({ kind, ...result, reviewUrl: '/trips/import/review' });
  } catch (error) {
    console.error('Acquisizione automatica fallita.', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Acquisizione non riuscita.' },
      { status: 400 }
    );
  }
}
