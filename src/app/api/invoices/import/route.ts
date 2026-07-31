import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import {
  createManagedImportStream,
  type ManagedImportCompletion,
  wantsManagedImportStream
} from '@/lib/managed-import-stream';
import { importSmartInvoicePdfFiles } from '@/lib/smart-invoice-import';

const IMPORT_PATH = '/acquisitions/invoices';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(message: string) {
  return redirectTo(`${IMPORT_PATH}?${new URLSearchParams({ error: message }).toString()}`);
}

function getImportErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 300)
    : 'Import non riuscito.';
}

async function executeImport(files: File[]): Promise<ManagedImportCompletion> {
  try {
    const result = await importSmartInvoicePdfFiles(files);

    revalidatePath('/acquisitions');
    revalidatePath('/fuel');
    revalidatePath('/fuel/import/review');
    revalidatePath('/maintenances/expenses');
    revalidatePath('/maintenances/expenses/review');
    revalidatePath('/vehicles/tractors');

    const importedDocuments = result.fuelDocuments + result.maintenanceDocuments;
    if (importedDocuments === 0 && result.duplicateDocuments === 0 && result.duplicateRows === 0) {
      throw new Error(result.errors[0] || 'Nessuna fattura WinSoftware o manutenzione riconosciuta.');
    }

    const duplicateCount = result.duplicateDocuments + result.duplicateRows;
    const duplicateNote = duplicateCount > 0 ? ` ${duplicateCount} elementi già presenti ignorati.` : '';
    const errorNote = result.errors.length > 0 ? ` ${result.errors.length} pagine richiedono verifica manuale.` : '';
    const tractorNote = result.createdTractors > 0 ? ` ${result.createdTractors} nuove targhe aggiunte ai trattori.` : '';

    let redirectTo = '/acquisitions';
    if (result.fuelDocuments > 0 && result.maintenanceDocuments === 0) redirectTo = '/fuel/import/review';
    if (result.maintenanceDocuments > 0 && result.fuelDocuments === 0) {
      redirectTo = '/maintenances/expenses/review';
    }

    return {
      redirectTo,
      notice: {
        type: result.errors.length > 0 ? 'error' : 'info',
        title: 'Fatture classificate e preparate',
        message: `${result.fuelDocuments} fatture carburante (${result.fuelRows} righe) e ${result.maintenanceDocuments} fatture manutenzione (${result.maintenanceLines} operazioni) in attesa di conferma.${duplicateNote}${tractorNote}${errorNote}`
      }
    };
  } catch (error) {
    console.error('Import fatture WinSoftware fallito.', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const streamProgress = wantsManagedImportStream(request);
  const user = await getCurrentUser();
  if (!user) {
    return streamProgress
      ? Response.json({ error: 'Sessione scaduta. Accedi di nuovo.' }, { status: 401 })
      : redirectTo('/login');
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length === 0) {
      if (streamProgress) {
        return createManagedImportStream(
          async () => {
            throw new Error('Nessun PDF selezionato.');
          },
          { errorMessage: getImportErrorMessage }
        );
      }
      return redirectWithError('Nessun PDF selezionato.');
    }

    if (streamProgress) {
      return createManagedImportStream(() => executeImport(files), {
        initialMessage: 'PDF ricevuti. OCR e classificazione automatica avviati.',
        errorMessage: getImportErrorMessage
      });
    }

    const completion = await executeImport(files);
    await setFlashMessage(completion.notice);
    return redirectTo(completion.redirectTo);
  } catch (error) {
    console.error('Import fatture WinSoftware fallito.', error);
    return redirectWithError(getImportErrorMessage(error));
  }
}
