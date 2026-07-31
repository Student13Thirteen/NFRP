import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { getTollActionErrorMessage, importTollCsvFiles } from '@/lib/toll-import';

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function redirectWithError(path: string, message: string) {
  const params = new URLSearchParams({ error: message });
  return redirectTo(`${path}?${params.toString()}`);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((file): file is File => file instanceof File && file.size > 0);
    const result = await importTollCsvFiles(files);

    revalidatePath('/tolls');
    revalidatePath('/tolls/cards');
    revalidatePath('/vehicles/tractors');
    revalidatePath('/tolls/import/review');

    const details = [
      `${result.importedRows} righe in attesa`,
      `${result.duplicateRows} gia presenti`,
      result.createdCards > 0 ? `${result.createdCards} tessere create` : null,
      result.assignedCards > 0 ? `${result.assignedCards} tessere associate a targa` : null,
      result.createdTractors > 0 ? `${result.createdTractors} targhe aggiunte in anagrafica` : null,
      result.reviewRows > 0 ? `${result.reviewRows} righe da controllare` : null
    ].filter(Boolean);

    await setFlashMessage({
      type: 'info',
      title: 'Import autostrade completato',
      message: `${details.join(', ')}. Controlla e conferma le righe importate.`
    });

    return redirectTo(result.importedRows > 0 ? '/tolls/import/review' : '/tolls');
  } catch (error) {
    console.error('Import autostrade fallito.', error);
    return redirectWithError('/tolls/import', getTollActionErrorMessage(error));
  }
}
