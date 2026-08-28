import { describe, expect, it } from 'vitest';
import { detectTripImportDocument } from '@/lib/trip-import-file-types';

describe('formati acquisizione bolle container', () => {
  it.each([
    [Buffer.from('%PDF-1.7\n'), 'application/pdf', 'pdf'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg', 'image'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png', 'image'],
    [Buffer.from('RIFF0000WEBP'), 'image/webp', 'image']
  ])('riconosce il contenuto reale senza fidarsi del solo nome', (buffer, mimeType, kind) => {
    expect(detectTripImportDocument(buffer)).toMatchObject({ mimeType, kind });
  });

  it('rifiuta un file che dichiara un formato ma non ne ha la firma', () => {
    expect(detectTripImportDocument(Buffer.from('non e un documento valido'))).toBeNull();
  });
});
