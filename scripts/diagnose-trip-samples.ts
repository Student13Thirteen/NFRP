import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { extractInboxPdfTextFromBuffer } from '../src/lib/inbox-analysis';
import { parseTripWaybillText } from '../src/lib/trip-import-parser';

async function main() {
  const sampleDir = process.argv[2];
  if (!sampleDir) throw new Error('Indica la cartella dei PDF da analizzare.');

  const names = (await readdir(sampleDir)).filter((name) => name.toLocaleLowerCase('it-IT').endsWith('.pdf')).sort();
  for (const name of names) {
    const extraction = await extractInboxPdfTextFromBuffer(await readFile(path.join(sampleDir, name)));
    console.log(`### FILE ${name}`);
    console.log(`### STATUS ${extraction.status}`);
    console.log(`### TEXT\n${extraction.text}`);
    console.log(`### PARSED\n${JSON.stringify(parseTripWaybillText(extraction.text || ''), null, 2)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
