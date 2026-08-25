import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMaxUploadBytes, getUploadDir } from '@/lib/env';
import { sanitizeFileName } from '@/lib/files';
import { findPdfHeaderOffset } from '@/lib/pdf';

export type StoredRoadEventFile = {
  filePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
};

function detectFile(buffer: Buffer): { extension: string; mimeType: string } | null {
  if (findPdfHeaderOffset(buffer) >= 0) return { extension: '.pdf', mimeType: 'application/pdf' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', mimeType: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: '.webp', mimeType: 'image/webp' };
  }
  return null;
}

export async function storeRoadEventFile(file: File): Promise<StoredRoadEventFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const maxUploadBytes = getMaxUploadBytes();
  if (buffer.length <= 0) throw new Error('Uno degli allegati è vuoto.');
  if (buffer.length > maxUploadBytes) {
    throw new Error(`Un allegato supera il limite di ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }
  const detected = detectFile(buffer);
  if (!detected) throw new Error('Sono accettati soltanto PDF e immagini JPG, PNG o WebP.');

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}${detected.extension}`;
  await writeFile(path.join(uploadDir, storedName), buffer, { flag: 'wx' });
  return {
    filePath: storedName,
    originalFileName: sanitizeFileName(`${path.parse(file.name || 'allegato').name}${detected.extension}`),
    fileSize: buffer.length,
    mimeType: detected.mimeType
  };
}

export function getRoadEventFiles(formData: FormData): File[] {
  const files = formData
    .getAll('files')
    .filter((value): value is File => value instanceof File && value.size > 0 && Boolean(value.name));
  const maxUploadBytes = getMaxUploadBytes();
  if (files.reduce((total, file) => total + file.size, 0) > maxUploadBytes) {
    throw new Error(`Gli allegati superano il limite complessivo di ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }
  return files;
}
