import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import {
  createManagedImportStream,
  type ManagedImportCompletion,
  wantsManagedImportStream
} from '@/lib/managed-import-stream';
import {
  getRoadFineImportErrorMessage,
  importRoadFinePdfFiles
} from '@/lib/road-fine-import';

const IMPORT_PATH = '/fines/import';
const REVIEW_PATH = '/fines?status=TO_REVIEW';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(message: string) {
  return redirectTo(`${IMPORT_PATH}?${new URLSearchParams({ error: message }).toString()}`);
}

async function executeImport(files: File[]): Promise<ManagedImportCompletion> {
  const result = await importRoadFinePdfFiles(files);
  if (result.importedDocuments === 0 && result.supplementalDocuments === 0 && result.duplicateDocuments === 0) {
    throw new Error(result.errors[0] || 'Nessun verbale riconosciuto nei PDF selezionati.');
  }

  revalidatePath('/acquisitions');
  revalidatePath('/dashboard');
  revalidatePath('/fines');

  const duplicateNote = result.duplicateDocuments > 0 ? ` ${result.duplicateDocuments} PDF già presenti ignorati.` : '';
  const supplementalNote = result.supplementalDocuments > 0
    ? ` ${result.supplementalDocuments} PDF diversi aggiunti al fascicolo di verbali già esistenti.`
    : '';
  const errorNote = result.errors.length > 0 ? ` ${result.errors.length} file non preparati: inseriscili manualmente dopo averli verificati.` : '';
  return {
    redirectTo: result.importedDocuments + result.supplementalDocuments === 1 && result.errors.length === 0
      ? `/fines/${result.importedIds[0]}`
      : REVIEW_PATH,
    notice: {
      type: result.errors.length > 0 ? 'error' : 'info',
      title: 'Verbali preparati per il controllo',
      message: `${result.importedDocuments} verbali acquisiti come bozze non contabili.${supplementalNote}${duplicateNote}${errorNote}`
    }
  };
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
        return createManagedImportStream(async () => { throw new Error('Nessun PDF selezionato.'); }, {
          errorMessage: getRoadFineImportErrorMessage
        });
      }
      return redirectWithError('Nessun PDF selezionato.');
    }

    if (streamProgress) {
      return createManagedImportStream(() => executeImport(files), {
        initialMessage: 'PDF ricevuti. Lettura dei verbali e controlli automatici avviati.',
        errorMessage: getRoadFineImportErrorMessage
      });
    }

    const completion = await executeImport(files);
    await setFlashMessage(completion.notice);
    return redirectTo(completion.redirectTo);
  } catch (error) {
    console.error('Acquisizione verbali fallita.', error);
    return redirectWithError(getRoadFineImportErrorMessage(error));
  }
}
