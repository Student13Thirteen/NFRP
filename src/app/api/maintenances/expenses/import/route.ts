import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getExpenseImportErrorMessage, importExpensePdfFiles } from '@/lib/expense-import';
import { setFlashMessage } from '@/lib/flash';
import {
  createManagedImportStream,
  type ManagedImportCompletion,
  wantsManagedImportStream
} from '@/lib/managed-import-stream';

const IMPORT_PATH = '/maintenances/expenses/import';
const REVIEW_PATH = '/maintenances/expenses/review';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

async function executeImport(files: File[]): Promise<ManagedImportCompletion> {
  try {
    const result = await importExpensePdfFiles(files, 'MAINTENANCE');

    revalidatePath('/acquisitions');
    revalidatePath('/maintenances/expenses');
    revalidatePath(REVIEW_PATH);

    const duplicateNote = result.duplicateDocuments > 0 ? ` ${result.duplicateDocuments} documenti già presenti ignorati.` : '';
    const errorNote = result.errors.length > 0 ? ` ${result.errors.length} file non importati.` : '';
    return {
      redirectTo: result.importedDocuments > 0 || result.duplicateDocuments > 0 ? REVIEW_PATH : IMPORT_PATH,
      notice: {
        type: result.errors.length > 0 ? 'error' : 'info',
        title: 'Import manutenzioni completato',
        message: `${result.importedDocuments} documenti, ${result.totalLines} righe da controllare e validare.${duplicateNote}${errorNote}`
      }
    };
  } catch (error) {
    console.error('Import documenti di spesa fallito.', error);
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
          { errorMessage: getExpenseImportErrorMessage }
        );
      }
      return redirectWithError(IMPORT_PATH, 'Nessun PDF selezionato.');
    }

    if (streamProgress) {
      return createManagedImportStream(() => executeImport(files), {
        initialMessage: 'PDF ricevuti. Separazione pagine e OCR manutenzioni avviati.',
        errorMessage: getExpenseImportErrorMessage
      });
    }

    const completion = await executeImport(files);
    await setFlashMessage(completion.notice);
    return redirectTo(completion.redirectTo);
  } catch (error) {
    console.error('Import documenti di spesa fallito.', error);
    return redirectWithError(IMPORT_PATH, getExpenseImportErrorMessage(error));
  }
}
