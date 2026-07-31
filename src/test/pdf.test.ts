import { describe, expect, it } from 'vitest';
import { PDF_HEADER_SCAN_BYTES, findPdfHeaderOffset, isPdfLikeNameOrType } from '@/lib/pdf';

describe('PDF upload helpers', () => {
  it('detects a standard PDF header at the beginning of the file', () => {
    const buffer = Buffer.from('%PDF-1.6\n1 0 obj\n');

    expect(findPdfHeaderOffset(buffer)).toBe(0);
  });

  it('accepts PDF headers after leading bytes within the scan window', () => {
    const leadingBytes = Buffer.alloc(2048, 0);
    const buffer = Buffer.concat([leadingBytes, Buffer.from('%PDF-1.7\n')]);

    expect(findPdfHeaderOffset(buffer)).toBe(2048);
  });

  it('does not accept PDF-like data beyond the scan window', () => {
    const leadingBytes = Buffer.alloc(PDF_HEADER_SCAN_BYTES + 1, 0);
    const buffer = Buffer.concat([leadingBytes, Buffer.from('%PDF-1.7\n')]);

    expect(findPdfHeaderOffset(buffer)).toBe(-1);
  });

  it('recognizes PDFs from MIME type or file extension', () => {
    expect(isPdfLikeNameOrType('documento.PDF', '')).toBe(true);
    expect(isPdfLikeNameOrType('documento', 'application/pdf; charset=binary')).toBe(true);
    expect(isPdfLikeNameOrType('documento.txt', 'text/plain')).toBe(false);
  });
});
