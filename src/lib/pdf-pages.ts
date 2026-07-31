import 'server-only';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getInboxOcrTimeoutMs, getOptionalEnv } from '@/lib/env';

const execFileAsync = promisify(execFile);

const splitPdfScript = [
  'import pathlib',
  'import sys',
  'import pikepdf',
  '',
  'source = sys.argv[1]',
  'target = pathlib.Path(sys.argv[2])',
  'with pikepdf.Pdf.open(source) as pdf:',
  '    print(len(pdf.pages))',
  '    for index, page in enumerate(pdf.pages, start=1):',
  '        output = pikepdf.Pdf.new()',
  '        output.pages.append(page)',
  "        output.save(target / f'page-{index}.pdf')"
].join('\n');

export type PdfPage = {
  pageNumber: number;
  pageCount: number;
  buffer: Buffer;
};

export async function splitPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'expense-pdf-pages-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const pythonCommand = getOptionalEnv('PYTHON3_BIN', 'python3');

  try {
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync(pythonCommand, ['-c', splitPdfScript, inputPath, tempDir], {
      timeout: getInboxOcrTimeoutMs(),
      maxBuffer: 1024 * 1024
    });
    const pageCount = Number.parseInt(stdout.trim(), 10);
    if (!Number.isInteger(pageCount) || pageCount <= 0) {
      throw new Error('Il PDF non contiene pagine leggibili.');
    }

    return Promise.all(
      Array.from({ length: pageCount }, async (_, index) => ({
        pageNumber: index + 1,
        pageCount,
        buffer: await readFile(path.join(tempDir, `page-${index + 1}.pdf`))
      }))
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Separazione pagine non disponibile: Python/pikepdf non trovato.');
    }
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
