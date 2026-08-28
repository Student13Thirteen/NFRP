import { findPdfHeaderOffset } from '@/lib/pdf';

export type TripImportDocumentKind = 'pdf' | 'image';

export type DetectedTripImportDocument =
  | {
      extension: '.pdf';
      mimeType: 'application/pdf';
      kind: 'pdf';
    }
  | {
      extension: '.jpg' | '.png' | '.webp';
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      kind: 'image';
    };

export function detectTripImportDocument(buffer: Buffer): DetectedTripImportDocument | null {
  if (findPdfHeaderOffset(buffer) >= 0) {
    return { extension: '.pdf', mimeType: 'application/pdf', kind: 'pdf' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mimeType: 'image/jpeg', kind: 'image' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', mimeType: 'image/png', kind: 'image' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: '.webp', mimeType: 'image/webp', kind: 'image' };
  }
  return null;
}
