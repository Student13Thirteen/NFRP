import 'server-only';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  getBooleanEnv,
  getInboxOcrCleanEnabled,
  getInboxOcrJobs,
  getInboxOcrLanguages,
  getInboxOcrTimeoutMs,
  getOptionalEnv
} from '@/lib/env';

const execFileAsync = promisify(execFile);

// Numero di processi paralleli per OCRmyPDF: configurato da env oppure automatico sul numero di core.
// Cap a 8 per evitare valori assurdi; il vecchio comportamento (un solo core) raddoppiava i tempi.
function resolveOcrJobs(): number {
  const configured = getInboxOcrJobs();
  const cpuCount = Math.max(1, os.cpus()?.length || 1);
  const jobs = configured > 0 ? configured : cpuCount;
  return Math.min(Math.max(1, jobs), 8);
}

export type OcrTextResult = {
  text: string;
  status: string;
};

export type ReadPdfTextOptions = {
  clean?: boolean;
  languages?: string;
  tesseractPageSegMode?: string;
};

type OcrSidecarOptions = {
  clean?: boolean;
  languages?: string;
  outputType?: 'pdf' | 'none';
  pages?: string;
  rotatePages?: boolean;
  tesseractPageSegMode?: string;
};

const rotatePdfPagesScript = [
  'import sys',
  'import pikepdf',
  '',
  'angle = int(sys.argv[3])',
  'with pikepdf.Pdf.open(sys.argv[1]) as pdf:',
  '    for page in pdf.pages:',
  "        page.Rotate = (int(page.get('/Rotate', 0)) + angle) % 360",
  '    pdf.save(sys.argv[2])'
].join('\n');

const cropImageScript = [
  'import sys',
  'from PIL import Image, ImageOps',
  '',
  'image = Image.open(sys.argv[1]).convert("L")',
  'box = tuple(int(value) for value in sys.argv[3:7])',
  'crop = ImageOps.autocontrast(image.crop(box))',
  'crop = crop.resize((crop.width * 6, crop.height * 6), Image.Resampling.LANCZOS)',
  'crop.save(sys.argv[2])'
].join('\n');

const removeBlueInkFromMaintenanceTableScript = [
  'import sys',
  'from PIL import Image, ImageOps',
  '',
  'image = Image.open(sys.argv[1]).convert("RGB")',
  'width, height = image.size',
  'source = image.load()',
  'cleaned = Image.new("L", image.size, 255)',
  'target = cleaned.load()',
  'for y in range(height):',
  '    for x in range(width):',
  '        red, green, blue = source[x, y]',
  '        spread = max(red, green, blue) - min(red, green, blue)',
  '        if blue == max(red, green, blue) and spread > 4:',
  '            target[x, y] = 255',
  '        else:',
  '            target[x, y] = min(255, round(0.25 * red + 0.65 * green + 0.10 * blue))',
  'cleaned = ImageOps.autocontrast(cleaned, cutoff=1)',
  'table = cleaned.crop((round(width * 0.02), round(height * 0.26), round(width * 0.98), round(height * 0.55)))',
  'table.save(sys.argv[2])'
].join('\n');

type TesseractWord = {
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
  text: string;
};

function compactOcrText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTesseractTsv(value: string): TesseractWord[] {
  return value
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line): TesseractWord[] => {
      const cells = line.split('\t');
      if (cells.length < 12 || cells[0] !== '5') return [];
      const word = {
        left: Number(cells[6]),
        top: Number(cells[7]),
        width: Number(cells[8]),
        height: Number(cells[9]),
        confidence: Number(cells[10]),
        text: cells.slice(11).join('\t').trim()
      };
      if (
        !Number.isFinite(word.left) ||
        !Number.isFinite(word.top) ||
        !Number.isFinite(word.width) ||
        !Number.isFinite(word.height) ||
        !word.text
      ) {
        return [];
      }
      return [word];
    });
}

function isCommonFireExtinguisherCapacity(value: number): boolean {
  return [1, 2, 3, 4, 5, 6, 9, 12, 25, 30, 50, 100].includes(value);
}

async function readFireExtinguisherWeight(
  tesseractCommand: string,
  pythonCommand: string,
  sourceImagePath: string,
  cropPath: string,
  box: [number, number, number, number]
): Promise<number | null> {
  await execFileAsync(
    pythonCommand,
    ['-c', cropImageScript, sourceImagePath, cropPath, ...box.map(String)],
    { timeout: getInboxOcrTimeoutMs(), maxBuffer: 1024 * 1024 }
  );

  for (const pageSegMode of ['7', '10']) {
    const { stdout } = await execFileAsync(
      tesseractCommand,
      [
        cropPath,
        'stdout',
        '-l',
        'eng',
        '--psm',
        pageSegMode,
        '-c',
        'tessedit_char_whitelist=0123456789'
      ],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 1024 * 1024 }
    );
    const match = String(stdout).match(/\d{1,3}/);
    const capacity = match ? Number(match[0]) : 0;
    if (isCommonFireExtinguisherCapacity(capacity)) return capacity;
  }

  return null;
}

async function readFireExtinguisherTableText(inputPath: string, tempDir: string, baseText: string): Promise<string> {
  const normalized = normalizeOcrText(baseText);
  if (!normalized.includes('estintor') || !normalized.includes('matricola')) return '';

  const sourceImagePath = path.join(tempDir, 'fire-extinguisher-table.png');
  const ghostscriptCommand = getOptionalEnv('GHOSTSCRIPT_BIN', 'gs');
  const tesseractCommand = getOptionalEnv('TESSERACT_BIN', 'tesseract');
  const pythonCommand = getOptionalEnv('PYTHON3_BIN', 'python3');

  try {
    await execFileAsync(
      ghostscriptCommand,
      [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-sDEVICE=pnggray',
        '-r200',
        '-dFirstPage=1',
        '-dLastPage=1',
        `-sOutputFile=${sourceImagePath}`,
        inputPath
      ],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 2 * 1024 * 1024 }
    );
    const { stdout } = await execFileAsync(
      tesseractCommand,
      [sourceImagePath, 'stdout', '-l', getInboxOcrLanguages(), '--psm', '11', 'tsv'],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 8 * 1024 * 1024 }
    );
    const words = parseTesseractTsv(String(stdout));
    const matricola = words.find((word) => normalizeOcrText(word.text).includes('matricola'));
    const polvere = words.find(
      (word) => normalizeOcrText(word.text).includes('polvere') && (!matricola || word.top > matricola.top)
    );
    if (!matricola || !polvere || polvere.top <= matricola.top) return '';

    const serialWords = words
      .filter(
        (word) =>
          /^\d{1,12}$/.test(word.text) &&
          word.confidence >= 20 &&
          word.left > matricola.left + matricola.width + 10 &&
          word.top >= matricola.top - 35 &&
          word.top + word.height < polvere.top - 5
      )
      .sort((left, right) => left.left - right.left);

    const supplementalLines: string[] = [];
    for (const [index, serial] of serialWords.entries()) {
      const centerX = Math.round(serial.left + serial.width / 2);
      const cropPath = path.join(tempDir, `fire-extinguisher-weight-${index + 1}.png`);
      const capacity = await readFireExtinguisherWeight(
        tesseractCommand,
        pythonCommand,
        sourceImagePath,
        cropPath,
        [
          Math.max(0, centerX - 80),
          Math.max(0, polvere.top - 40),
          centerX + 80,
          polvere.top + polvere.height + 45
        ]
      );
      if (capacity !== null) {
        supplementalLines.push(`Matricola ${serial.text} - capacità ${capacity} kg`);
      }
    }

    return supplementalLines.length > 0
      ? ['OCR MIRATO TABELLA ESTINTORI', ...supplementalLines].join('\n')
      : '';
  } catch {
    // Il testo OCR di base resta utilizzabile e i dati mancanti rimangono da verificare manualmente.
    return '';
  }
}

/**
 * Seconda lettura prudente delle tabelle di manutenzione: rimuove i pixel
 * cromatici blu prima dell'OCR, così le annotazioni a penna non coprono
 * quantità e prezzi stampati. Il risultato resta sempre una proposta da
 * validare e non viene usato per targa, km o allocazione.
 */
export async function readMaintenanceTableTextWithoutBlueInk(fileBuffer: Buffer): Promise<OcrTextResult> {
  if (!getBooleanEnv('INBOX_OCR_ENABLED', true)) {
    return { text: '', status: 'OCR disattivato da INBOX_OCR_ENABLED.' };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-table-ocr-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const sourceImagePath = path.join(tempDir, 'source.png');
  const cleanTablePath = path.join(tempDir, 'table-no-blue.png');
  const ghostscriptCommand = getOptionalEnv('GHOSTSCRIPT_BIN', 'gs');
  const tesseractCommand = getOptionalEnv('TESSERACT_BIN', 'tesseract');
  const pythonCommand = getOptionalEnv('PYTHON3_BIN', 'python3');

  try {
    await writeFile(inputPath, fileBuffer);
    await execFileAsync(
      ghostscriptCommand,
      [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-sDEVICE=png16m',
        '-r200',
        '-dFirstPage=1',
        '-dLastPage=1',
        `-sOutputFile=${sourceImagePath}`,
        inputPath
      ],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 2 * 1024 * 1024 }
    );
    await execFileAsync(
      pythonCommand,
      ['-c', removeBlueInkFromMaintenanceTableScript, sourceImagePath, cleanTablePath],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 1024 * 1024 }
    );
    const { stdout } = await execFileAsync(
      tesseractCommand,
      [cleanTablePath, 'stdout', '-l', 'eng', '--psm', '4'],
      { timeout: getInboxOcrTimeoutMs(), maxBuffer: 8 * 1024 * 1024 }
    );
    const text = compactOcrText(String(stdout));
    return text
      ? {
          text,
          status: `Tabella manutenzione riletta senza inchiostro blu (${text.length} caratteri).`
        }
      : {
          text: '',
          status: 'La rilettura della tabella senza inchiostro blu non ha prodotto testo leggibile.'
        };
  } catch (error) {
    return { text: '', status: describeOcrFailure(error) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeOcrText(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function hasRevisionStickerExpiry(value: string): boolean {
  const normalized = normalizeOcrText(value);
  return normalized.includes('scadenza') && /\b(?:0?[1-9]|1[0-2])[./-]\d{4}\b/.test(normalized);
}

function shouldReadRotatedRevisionSticker(value: string): boolean {
  const normalized = normalizeOcrText(value);
  return (
    normalized.includes('carta di circolazione') &&
    normalized.includes('revisioni') &&
    !hasRevisionStickerExpiry(normalized)
  );
}

function describeOcrFailure(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    return 'OCR non disponibile: comando OCRmyPDF non trovato.';
  }

  if (error instanceof Error) {
    const firstLine = error.message.split('\n').map((line) => line.trim()).find(Boolean);
    return `OCR non completato: ${firstLine || error.name}.`;
  }

  return 'OCR non completato.';
}

async function runOcrSidecar(
  command: string,
  inputPath: string,
  outputPath: string,
  sidecarPath: string,
  options: OcrSidecarOptions = {}
): Promise<string> {
  const outputType = options.outputType || 'pdf';
  const args = [
    '--force-ocr',
    ...(options.rotatePages === false ? [] : ['--rotate-pages']),
    '--deskew',
    ...((options.clean ?? getInboxOcrCleanEnabled()) ? ['--clean'] : []),
    '--output-type',
    outputType,
    '--optimize',
    '0',
    '--jobs',
    String(resolveOcrJobs()),
    '--sidecar',
    sidecarPath,
    '-q'
  ];

  if (options.pages) args.push('--pages', options.pages);
  if (options.tesseractPageSegMode) args.push('--tesseract-pagesegmode', options.tesseractPageSegMode);

  args.push('-l', options.languages || getInboxOcrLanguages(), inputPath, outputType === 'none' ? '-' : outputPath);

  await execFileAsync(command, args, {
    timeout: getInboxOcrTimeoutMs(),
    maxBuffer: 8 * 1024 * 1024
  });

  return compactOcrText(await readFile(sidecarPath, 'utf8'));
}

async function readRotatedRevisionStickerText(command: string, inputPath: string, tempDir: string): Promise<string> {
  const pythonCommand = getOptionalEnv('PYTHON3_BIN', 'python3');

  for (const rotation of [90, 270]) {
    const rotatedInputPath = path.join(tempDir, `revision-sticker-${rotation}.pdf`);
    const rotatedSidecarPath = path.join(tempDir, `revision-sticker-${rotation}.txt`);

    try {
      await execFileAsync(pythonCommand, ['-c', rotatePdfPagesScript, inputPath, rotatedInputPath, String(rotation)], {
        timeout: getInboxOcrTimeoutMs(),
        maxBuffer: 1024 * 1024
      });

      const text = await runOcrSidecar(command, rotatedInputPath, '', rotatedSidecarPath, {
        outputType: 'none',
        pages: '2',
        rotatePages: false,
        tesseractPageSegMode: '11'
      });

      if (hasRevisionStickerExpiry(text)) return text;
    } catch {
      // The base OCR remains usable if the optional rotated pass is unavailable.
    }
  }

  return '';
}

export async function readPdfTextWithOcr(
  fileBuffer: Buffer,
  options: ReadPdfTextOptions = {}
): Promise<OcrTextResult> {
  if (!getBooleanEnv('INBOX_OCR_ENABLED', true)) {
    return { text: '', status: 'OCR disattivato da INBOX_OCR_ENABLED.' };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'document-inbox-ocr-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputPath = path.join(tempDir, 'ocr.pdf');
  const sidecarPath = path.join(tempDir, 'ocr.txt');
  const command = getOptionalEnv('OCRMYPDF_BIN', 'ocrmypdf');

  try {
    await writeFile(inputPath, fileBuffer);
    const baseText = await runOcrSidecar(command, inputPath, outputPath, sidecarPath, {
      clean: options.clean,
      languages: options.languages,
      tesseractPageSegMode: options.tesseractPageSegMode
    });
    const revisionStickerText = shouldReadRotatedRevisionSticker(baseText)
      ? await readRotatedRevisionStickerText(command, inputPath, tempDir)
      : '';
    const fireExtinguisherTableText = await readFireExtinguisherTableText(inputPath, tempDir, baseText);
    const text = compactOcrText(
      [baseText, revisionStickerText, fireExtinguisherTableText].filter(Boolean).join('\n')
    );
    if (!text) return { text: '', status: 'OCR eseguito, ma non ha prodotto testo leggibile.' };

    return {
      text,
      status: `OCR locale OCRmyPDF/Tesseract completato (${text.length} caratteri, lingue ${
        options.languages || getInboxOcrLanguages()
      }).${
        revisionStickerText ? ' Passaggio ruotato sul talloncino revisioni completato.' : ''
      }${fireExtinguisherTableText ? ' Tabella estintori letta con OCR mirato per matricola e kg.' : ''}`
    };
  } catch (error) {
    return { text: '', status: describeOcrFailure(error) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
