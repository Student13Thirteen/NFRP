import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { getTripImportActionErrorMessage, importTripWaybillFiles } from '@/lib/trip-import';

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
    const result = await importTripWaybillFiles(files);

    revalidatePath('/trips');
    revalidatePath('/trips/container');
    revalidatePath('/trips/import/review');
    revalidatePath('/vehicles/drivers');
    revalidatePath('/vehicles/tractors');
    revalidatePath('/vehicles/trailers');

    await setFlashMessage({
      type: 'info',
      title: 'Acquisizione bolle container completata',
      message: `${result.importedRows} nuove proposte in attesa, ${result.duplicateRows} già presenti. Nessuna anagrafica o voce di costo è stata creata: controlla e conferma oppure scarta.`
    });

    return redirectTo(result.importedRows > 0 || result.pendingRows > 0 ? '/trips/import/review' : '/trips/container');
  } catch (error) {
    console.error('Import bolle viaggio fallito.', error);
    return redirectWithError('/trips/import', getTripImportActionErrorMessage(error));
  }
}
