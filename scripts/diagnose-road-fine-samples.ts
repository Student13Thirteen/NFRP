import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { extractInboxPdfTextFromBuffer } from '../src/lib/inbox-analysis';
import { parseRoadFineText } from '../src/lib/road-fine-parser';

async function main() {
  const sampleDir = process.argv[2];
  if (!sampleDir) throw new Error('Uso: tsx scripts/diagnose-road-fine-samples.ts <cartella-pdf>');

  const names = (await readdir(sampleDir)).filter((name) => name.toLocaleLowerCase('it-IT').endsWith('.pdf')).sort();
  if (names.length === 0) throw new Error('Nessun PDF trovato nella cartella indicata.');

  for (const name of names) {
    const extraction = await extractInboxPdfTextFromBuffer(await readFile(path.join(sampleDir, name)));
    const parsed = parseRoadFineText(extraction.text);
    console.log(JSON.stringify({
      fileName: name,
      extractionSource: extraction.source,
      extractionStatus: extraction.status,
      parsed: {
        ...parsed,
        violationDate: parsed.violationDate?.toISOString().slice(0, 10) || null,
        notificationDate: parsed.notificationDate?.toISOString().slice(0, 10) || null,
        discountedPaymentDueDate: parsed.discountedPaymentDueDate?.toISOString().slice(0, 10) || null,
        paymentDueDate: parsed.paymentDueDate?.toISOString().slice(0, 10) || null,
        appealDueDate: parsed.appealDueDate?.toISOString().slice(0, 10) || null
      }
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
