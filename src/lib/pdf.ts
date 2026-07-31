const PDF_HEADER = Buffer.from('%PDF-');

export const PDF_HEADER_SCAN_BYTES = 64 * 1024;

export function findPdfHeaderOffset(buffer: Buffer, scanBytes = PDF_HEADER_SCAN_BYTES): number {
  const searchWindow = buffer.subarray(0, Math.min(buffer.length, scanBytes));
  return searchWindow.indexOf(PDF_HEADER);
}

export function isPdfLikeNameOrType(fileName: string, mimeType: string): boolean {
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
  return normalizedMimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

export function getPdfUploadDiagnostics(buffer: Buffer, scanBytes = PDF_HEADER_SCAN_BYTES) {
  return {
    pdfHeaderOffset: findPdfHeaderOffset(buffer, scanBytes),
    scannedBytes: Math.min(buffer.length, scanBytes),
    firstBytesHex: buffer.subarray(0, Math.min(buffer.length, 32)).toString('hex')
  };
}
