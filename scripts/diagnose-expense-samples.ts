import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseMaintenanceExpensePage } from '../src/lib/expense-import';
import { listExpenseLayoutProfiles, parseRegisteredExpenseLayout } from '../src/lib/expense-layout-profiles';
import { readPdfTextWithOcr } from '../src/lib/inbox-ocr';
import { splitPdfPages } from '../src/lib/pdf-pages';

async function findPdfFiles(inputPath: string): Promise<string[]> {
  const resolved = path.resolve(inputPath);
  const metadata = await stat(resolved);
  if (metadata.isFile()) return path.extname(resolved).toLocaleLowerCase('it-IT') === '.pdf' ? [resolved] : [];
  if (!metadata.isDirectory()) return [];

  const entries = await readdir(resolved, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => findPdfFiles(path.join(resolved, entry.name)))
  );
  return nested.flat();
}

async function diagnosePdf(filePath: string) {
  const pages = await splitPdfPages(await readFile(filePath));
  const reports = [];

  for (const page of pages) {
    const primary = await readPdfTextWithOcr(page.buffer, {
      clean: false,
      languages: 'eng',
      tesseractPageSegMode: '6'
    });
    const parsed = await parseMaintenanceExpensePage(page, primary.text || '');
    const profile = parseRegisteredExpenseLayout(primary.text || '');
    const computedNetCents = parsed.lines.reduce((sum, line) => sum + line.imponibileCents, 0);
    const computedGrossCents = parsed.lines.reduce((sum, line) => sum + line.totalCents, 0);
    const issues = [
      !parsed.supplierName ? 'fornitore non riconosciuto' : '',
      !parsed.documentNumber ? 'numero documento non riconosciuto' : '',
      !parsed.documentDate ? 'data documento non riconosciuta' : '',
      parsed.lines.some((line) => line.description.startsWith('Voce da compilare')) ? 'righe non riconosciute' : '',
      parsed.lines.some((line) => line.imponibileCents <= 0) ? 'una o più righe senza importo' : '',
      parsed.declaredTotalCents !== null && Math.abs(parsed.declaredTotalCents - computedGrossCents) > 2
        ? `totale dichiarato ${parsed.declaredTotalCents} diverso dal calcolato ${computedGrossCents}`
        : ''
    ].filter(Boolean);

    reports.push({
      page: page.pageNumber,
      pageCount: page.pageCount,
      ocrStatus: primary.status,
      profile: profile ? `${profile.profileId} (${profile.profileLabel})` : null,
      supplierName: parsed.supplierName,
      documentNumber: parsed.documentNumber,
      documentDate: parsed.documentDate?.toISOString().slice(0, 10) || null,
      declaredTotalCents: parsed.declaredTotalCents,
      computedNetCents,
      computedGrossCents,
      lines: parsed.lines,
      status: issues.length === 0 ? 'READY_FOR_HUMAN_REVIEW' : 'PROFILE_NEEDED',
      issues
    });
  }

  return { file: filePath, pages: reports };
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    throw new Error('Indica uno o più PDF o cartelle da analizzare.');
  }
  const files = (await Promise.all(inputs.map(findPdfFiles))).flat().sort((left, right) => left.localeCompare(right));
  if (files.length === 0) throw new Error('Nessun PDF trovato nei percorsi indicati.');

  const reports = [];
  for (const file of files) reports.push(await diagnosePdf(file));
  console.log(JSON.stringify({
    availableProfiles: listExpenseLayoutProfiles(),
    reports
  }, null, 2));

  if (reports.some((report) => report.pages.some((page) => page.status !== 'READY_FOR_HUMAN_REVIEW'))) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
