import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMaxUploadBytes, getUploadDir } from '@/lib/env';
import { sanitizeFileName, type StoredPdf } from '@/lib/files';
import { extractInboxPdfTextFromBuffer, type PdfTextExtraction } from '@/lib/inbox-analysis';
import { readImageTextWithOcr } from '@/lib/inbox-ocr';
import {
  detectTripImportDocument,
  type DetectedTripImportDocument
} from '@/lib/trip-import-file-types';

export type StoredTripImportDocument = {
  storedFile: StoredPdf;
  detected: DetectedTripImportDocument;
};

export async function storeTripImportDocument(
  file: File,
  buffer: Buffer
): Promise<StoredTripImportDocument> {
  const maxUploadBytes = getMaxUploadBytes();
  if (buffer.length <= 0) throw new Error('Il file della bolla è vuoto.');
  if (buffer.length > maxUploadBytes) {
    throw new Error(`Il file supera il limite di ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }

  const detected = detectTripImportDocument(buffer);
  if (!detected) throw new Error('Sono accettati soltanto PDF e immagini JPG, PNG o WebP valide.');

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}${detected.extension}`;
  await writeFile(path.join(uploadDir, storedName), buffer, { flag: 'wx' });
  const normalizedOriginalName = `${path.parse(file.name || 'bolla-container').name}${detected.extension}`;

  return {
    detected,
    storedFile: {
      filePath: storedName,
      originalFileName: sanitizeFileName(normalizedOriginalName),
      fileSize: buffer.length,
      mimeType: detected.mimeType
    }
  };
}

export async function extractTripImportDocumentText(
  fileBuffer: Buffer,
  detected: DetectedTripImportDocument
): Promise<PdfTextExtraction> {
  if (detected.kind === 'pdf') return extractInboxPdfTextFromBuffer(fileBuffer);

  const ocr = await readImageTextWithOcr(fileBuffer, detected.extension);
  return {
    text: ocr.text,
    status: `${ocr.status} Campi manoscritti e fotografia devono essere controllati dall'operatore.`,
    source: ocr.text ? 'ocr' : 'none'
  };
}
