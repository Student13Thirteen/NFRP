import 'server-only';

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMaxUploadBytes, getUploadDir } from '@/lib/env';
import { findPdfHeaderOffset, getPdfUploadDiagnostics, isPdfLikeNameOrType } from '@/lib/pdf';

export type StoredPdf = {
  filePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
};

export type NullableStoredPdf = {
  filePath: string | null;
  originalFileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
};

type StorePdfBufferOptions = {
  mimeType?: string;
};

export function sanitizeFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const base = path
    .basename(fileName, extension)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${base || 'documento'}${extension || '.pdf'}`;
}

export async function storePdfBuffer(
  buffer: Buffer,
  fileName: string,
  options: StorePdfBufferOptions = {}
): Promise<StoredPdf> {
  const maxUploadBytes = getMaxUploadBytes();
  const originalFileName = sanitizeFileName(fileName || 'documento.pdf');
  const fileSize = buffer.length;
  const providedMimeType = options.mimeType || 'application/pdf';

  if (fileSize <= 0) {
    throw new Error('Il file PDF è vuoto.');
  }
  if (fileSize > maxUploadBytes) {
    throw new Error(`Il file supera il limite di ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  }

  const pdfHeaderOffset = findPdfHeaderOffset(buffer);
  console.info('Upload PDF ricevuto.', {
    originalFileName,
    providedMimeType,
    fileSize,
    pdfHeaderOffset
  });

  if (!isPdfLikeNameOrType(originalFileName, providedMimeType) && pdfHeaderOffset === -1) {
    throw new Error('Sono accettati solo file PDF.');
  }

  if (pdfHeaderOffset === -1) {
    console.error('Upload PDF rifiutato: header non trovato.', {
      originalFileName,
      providedMimeType,
      fileSize,
      ...getPdfUploadDiagnostics(buffer)
    });
    throw new Error('Il file caricato non sembra un PDF valido.');
  }

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const storedName = `${Date.now()}-${randomUUID()}.pdf`;
  await writeFile(path.join(uploadDir, storedName), buffer, { flag: 'wx' });

  return {
    filePath: storedName,
    originalFileName,
    fileSize,
    mimeType: 'application/pdf'
  };
}

export async function storePdfFile(file: File): Promise<StoredPdf> {
  return storePdfBuffer(Buffer.from(await file.arrayBuffer()), file.name || 'documento.pdf', {
    mimeType: file.type || 'application/pdf'
  });
}

export function emptyStoredPdf(): NullableStoredPdf {
  return {
    filePath: null,
    originalFileName: null,
    fileSize: null,
    mimeType: null
  };
}

export async function readStoredPdf(relativePath: string) {
  const uploadDir = getUploadDir();
  const absolutePath = path.resolve(uploadDir, relativePath);
  const resolvedUploadDir = path.resolve(uploadDir);

  if (!absolutePath.startsWith(resolvedUploadDir + path.sep)) {
    throw new Error('Percorso file non valido.');
  }

  const [fileBuffer, fileStat] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  return { fileBuffer, fileStat };
}

export async function removeStoredPdf(relativePath: string) {
  const uploadDir = getUploadDir();
  const absolutePath = path.resolve(uploadDir, relativePath);
  const resolvedUploadDir = path.resolve(uploadDir);

  if (!absolutePath.startsWith(resolvedUploadDir + path.sep)) {
    throw new Error('Percorso file non valido.');
  }

  try {
    await unlink(absolutePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}
