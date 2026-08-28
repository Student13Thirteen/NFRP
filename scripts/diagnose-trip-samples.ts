import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { extractTripImportDocumentText } from '../src/lib/trip-import-document';
import { detectTripImportDocument } from '../src/lib/trip-import-file-types';
import { parseTripWaybillText } from '../src/lib/trip-import-parser';

async function main() {
  const samplePath = process.argv[2];
  if (!samplePath) throw new Error('Indica un PDF, un’immagine o una cartella di campioni da analizzare.');

  const metadata = await stat(samplePath);
  const filePaths = metadata.isDirectory()
    ? (await readdir(samplePath))
        .filter((name) => /\.(?:pdf|jpe?g|png|webp)$/iu.test(name))
        .sort()
        .map((name) => path.join(samplePath, name))
    : [samplePath];
  for (const filePath of filePaths) {
    const name = path.basename(filePath);
    const buffer = await readFile(filePath);
    const detected = detectTripImportDocument(buffer);
    if (!detected) {
      console.log(`### FILE ${name}\n### STATUS Formato non valido`);
      continue;
    }
    const extraction = await extractTripImportDocumentText(buffer, detected);
    console.log(`### FILE ${name}`);
    console.log(`### MIME ${detected.mimeType}`);
    console.log(`### STATUS ${extraction.status}`);
    console.log(`### TEXT\n${extraction.text}`);
    console.log(`### PARSED\n${JSON.stringify(parseTripWaybillText(extraction.text || ''), null, 2)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
