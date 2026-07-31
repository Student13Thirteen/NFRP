import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EntityType } from '@prisma/client';
import { analyzeInboxPdfExtraction, extractInboxPdfTextFromBuffer, type InboxAnalysis, type ReferenceData } from '../src/lib/inbox-analysis';
import { getInboxReferenceData } from '../src/lib/document-inbox';
import { inboxPageFileName, isInboxPageBatchCandidate } from '../src/lib/inbox-batch';
import { splitPdfPages } from '../src/lib/pdf-pages';

type PdfSample = {
  absolutePath: string;
  relativePath: string;
};

function formatIsoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '-';
}

function formatDetectedPlates(source: string): string {
  const plates = new Set<string>();
  const platePattern = /\b[A-Z]{2}\s*\d{3}\s*[A-Z]{2}\b/gi;

  for (const match of source.matchAll(platePattern)) {
    const index = match.index || 0;
    const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const lineEnd = source.indexOf('\n', index);
    const line = source.slice(lineStart, lineEnd >= 0 ? lineEnd : source.length).toLocaleLowerCase('it-IT');
    const window = source.slice(Math.max(0, index - 90), Math.min(source.length, index + match[0].length + 90)).toLocaleLowerCase('it-IT');
    const hasPlateContext = /\b(targa|immatricolazione|targato)\b/.test(window);
    const looksLikeModel = /\b(fabbricante|modello|motore|telaio)\b/.test(line);

    if ((lineStart === 0 || hasPlateContext) && !looksLikeModel) {
      plates.add(match[0].toLocaleUpperCase('it-IT').replace(/[^A-Z0-9]/g, ''));
    }
  }

  return plates.size > 0 ? Array.from(plates).sort((a, b) => a.localeCompare(b, 'it-IT')).join(',') : '-';
}

function formatSuggestion(analysis: InboxAnalysis, referenceData: ReferenceData): string {
  const documentType = referenceData.documentTypes.find((type) => type.id === analysis.suggestedDocumentTypeId);
  const entityType = analysis.suggestedEntityType;
  const entityId = analysis.suggestedEntityId;
  let entity = '-';

  if (entityType === EntityType.TRACTOR) {
    entity = referenceData.tractors.find((tractor) => tractor.id === entityId)?.plate || '-';
  } else if (entityType === EntityType.TRAILER) {
    entity = referenceData.trailers.find((trailer) => trailer.id === entityId)?.plate || '-';
  } else if (entityType === EntityType.DRIVER) {
    const driver = referenceData.drivers.find((item) => item.id === entityId);
    entity = driver ? `${driver.lastName} ${driver.firstName}` : '-';
  } else if (entityType === EntityType.OTHER) {
    const otherEntity = referenceData.otherEntities.find((item) => item.id === entityId);
    entity = otherEntity ? `${otherEntity.category}: ${otherEntity.name}` : '-';
  }

  return [
    `tipo=${documentType?.name || '-'}`,
    `entita=${entityType && entity !== '-' ? `${entityType}:${entity}` : '-'}`,
    `confidenza=${analysis.confidence}`
  ].join(' | ');
}

async function findPdfSamples(root: string, current = root): Promise<PdfSample[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nestedSamples = await Promise.all(
    entries.map(async (entry): Promise<PdfSample[]> => {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) return findPdfSamples(root, absolutePath);
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.pdf') return [];

      return [{
        absolutePath,
        relativePath: path.relative(root, absolutePath)
      }];
    })
  );

  return nestedSamples.flat().sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'it-IT'));
}

async function reportSampleBuffer(
  relativePath: string,
  fileName: string,
  fileBuffer: Buffer,
  referenceData: ReferenceData
) {
  const extraction = await extractInboxPdfTextFromBuffer(fileBuffer);
  const analysis = analyzeInboxPdfExtraction(
    {
      originalFileName: fileName
    },
    extraction,
    referenceData
  );

  console.log([
    relativePath,
    `testo=${extraction.source}`,
    `caratteri=${extraction.text.length}`,
    `targhe=${formatDetectedPlates(`${relativePath}\n${extraction.text}`)}`,
    formatSuggestion(analysis, referenceData),
    `emissione=${formatIsoDate(analysis.suggestedIssueDate)}`,
    `scadenza=${formatIsoDate(analysis.suggestedExpiryDate)}`,
    `costo=${analysis.suggestedAmountCents === null ? '-' : (analysis.suggestedAmountCents / 100).toFixed(2)}`,
    analysis.suggestedNotes ? `dettagli=${analysis.suggestedNotes.replace(/\n/g, ' / ')}` : 'dettagli=-',
    extraction.status
  ].join(' | '));
}

async function reportSample(sample: PdfSample, referenceData: ReferenceData) {
  const fileBuffer = await readFile(sample.absolutePath);
  const sourceFileName = path.basename(sample.relativePath);
  if (isInboxPageBatchCandidate(sourceFileName)) {
    const pages = await splitPdfPages(fileBuffer);
    if (pages.length > 1) {
      for (const page of pages) {
        const fileName = inboxPageFileName(sourceFileName, page.pageNumber);
        await reportSampleBuffer(
          `${sample.relativePath}#pagina-${page.pageNumber}`,
          fileName,
          page.buffer,
          referenceData
        );
      }
      return;
    }
  }
  await reportSampleBuffer(sample.relativePath, sourceFileName, fileBuffer, referenceData);
}

async function main() {
  const sampleRoot = path.resolve(process.argv[2] || process.env.DOCUMENT_SAMPLES_DIR || '/samples');
  const samples = await findPdfSamples(sampleRoot);

  if (samples.length === 0) {
    throw new Error(`Nessun PDF campione trovato in ${sampleRoot}.`);
  }

  console.log(`Report inbox su ${samples.length} PDF in ${sampleRoot}`);
  const referenceData = await getInboxReferenceData();
  for (const sample of samples) {
    try {
      await reportSample(sample, referenceData);
    } catch (error) {
      console.error(`${sample.relativePath} | errore=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
