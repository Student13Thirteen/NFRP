import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash';
import { getTripImportActionErrorMessage, importTripWaybillPdfFiles } from '@/lib/trip-import';

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
    const result = await importTripWaybillPdfFiles(files);

    revalidatePath('/trips');
    revalidatePath('/trips/container');
    revalidatePath('/trips/import/review');
    revalidatePath('/vehicles/drivers');
    revalidatePath('/vehicles/tractors');
    revalidatePath('/vehicles/trailers');

    const createdPieces = [
      result.createdDrivers > 0 ? `${result.createdDrivers} autisti` : null,
      result.createdTractors > 0 ? `${result.createdTractors} trattori` : null,
      result.createdTrailers > 0 ? `${result.createdTrailers} semirimorchi` : null,
      result.createdCustomers > 0 ? `${result.createdCustomers} committenti` : null,
      result.createdLocations > 0 ? `${result.createdLocations} luoghi` : null
    ].filter(Boolean);
    const createdNote = createdPieces.length > 0 ? ` Create nuove anagrafiche: ${createdPieces.join(', ')}.` : '';

    await setFlashMessage({
      type: 'info',
      title: 'Import bolle container completato',
      message: `${result.importedRows} righe in attesa di conferma, ${result.duplicateRows} gia presenti.${createdNote} Controllale e conferma o scarta.`
    });

    return redirectTo(result.importedRows > 0 ? '/trips/import/review' : '/trips/container');
  } catch (error) {
    console.error('Import bolle viaggio fallito.', error);
    return redirectWithError('/trips/import', getTripImportActionErrorMessage(error));
  }
}
