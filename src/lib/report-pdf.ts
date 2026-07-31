const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 26;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type FontName = 'F1' | 'F2';
type TextAlign = 'left' | 'right';
type ColorName = 'black' | 'muted' | 'red' | 'white' | 'border' | 'soft' | 'softRed';

type PdfRasterImage = {
  width: number;
  height: number;
  data: Buffer;
};

const colors: Record<ColorName, [number, number, number]> = {
  black: [0.06, 0.07, 0.09],
  muted: [0.36, 0.4, 0.47],
  red: [0.82, 0.04, 0.08],
  white: [1, 1, 1],
  border: [0.79, 0.82, 0.86],
  soft: [0.96, 0.97, 0.98],
  softRed: [1, 0.94, 0.94]
};

export type ReportColumn = {
  align?: TextAlign;
  key: string;
  label: string;
  weight: number;
};

export type ReportMetric = {
  label: string;
  value: string;
};

export type ReportRow = Record<string, string>;

export type ReportDefinition = {
  columns: ReportColumn[];
  filters?: string[];
  generatedAt?: Date;
  metrics: ReportMetric[];
  rows: ReportRow[];
  subtitle?: string;
  title: string;
};

function point(value: number): string {
  return value.toFixed(2);
}

function pdfY(top: number): number {
  return PAGE_HEIGHT - top;
}

function escapeText(value: string): string {
  return value
    .replace(/€/g, 'EUR')
    .replace(/[’‘]/g, "'")
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function colorCommand(color: ColorName, operator: 'rg' | 'RG'): string {
  const [red, green, blue] = colors[color];
  return `${red} ${green} ${blue} ${operator}`;
}

function truncate(text: string, width: number, fontSize: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim() || '-';
  const maxChars = Math.max(3, Math.floor(width / (fontSize * 0.52)));
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 3))}...`;
}

class ReportPdfPage {
  private commands: string[] = [];

  text(x: number, top: number, value: string, size: number, options?: { align?: TextAlign; color?: ColorName; font?: FontName; width?: number }) {
    const font = options?.font || 'F1';
    const color = options?.color || 'black';
    const width = options?.width || 0;
    const safeValue = truncate(value, width || 1000, size);
    const estimatedWidth = safeValue.length * size * 0.51;
    const textX = options?.align === 'right' && width ? x + width - estimatedWidth : x;
    this.commands.push(
      'BT',
      `/${font} ${point(size)} Tf`,
      colorCommand(color, 'rg'),
      `1 0 0 1 ${point(Math.max(x, textX))} ${point(pdfY(top + size))} Tm`,
      `(${escapeText(safeValue)}) Tj`,
      'ET'
    );
  }

  rect(x: number, top: number, width: number, height: number, options?: { fill?: ColorName; stroke?: ColorName; lineWidth?: number }) {
    if (options?.fill) this.commands.push(colorCommand(options.fill, 'rg'));
    if (options?.stroke) this.commands.push(colorCommand(options.stroke, 'RG'));
    this.commands.push(`${point(options?.lineWidth || 1)} w`);
    this.commands.push(`${point(x)} ${point(pdfY(top + height))} ${point(width)} ${point(height)} re`);
    this.commands.push(options?.fill && options?.stroke ? 'B' : options?.fill ? 'f' : 'S');
  }

  line(x1: number, top1: number, x2: number, top2: number, color: ColorName = 'border', width = 1) {
    this.commands.push(colorCommand(color, 'RG'), `${point(width)} w`, `${point(x1)} ${point(pdfY(top1))} m`, `${point(x2)} ${point(pdfY(top2))} l`, 'S');
  }

  image(name: string, x: number, top: number, width: number, height: number) {
    this.commands.push(
      'q',
      `${point(width)} 0 0 ${point(height)} ${point(x)} ${point(pdfY(top + height))} cm`,
      `/${name} Do`,
      'Q'
    );
  }

  render(): Buffer {
    return Buffer.from(`${this.commands.join('\n')}\n`, 'latin1');
  }
}

function getReportLogo(): PdfRasterImage | null {
  return null;
}

function buildPdf(contents: Buffer[], logo: PdfRasterImage | null): Buffer {
  const pageObjectStart = 3;
  const fontRegularRef = pageObjectStart + contents.length;
  const fontBoldRef = fontRegularRef + 1;
  const imageRef = logo ? fontBoldRef + 1 : null;
  const contentObjectStart = fontBoldRef + 1 + (logo ? 1 : 0);
  const pageRefs = contents.map((_, index) => pageObjectStart + index);
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${contents.length} >>`, 'latin1')
  ];

  contents.forEach((_, index) => {
    const imageResource = imageRef ? ` /XObject << /Im1 ${imageRef} 0 R >>` : '';
    objects.push(Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${point(PAGE_WIDTH)} ${point(PAGE_HEIGHT)}] /Resources << /Font << /F1 ${fontRegularRef} 0 R /F2 ${fontBoldRef} 0 R >>${imageResource} >> /Contents ${contentObjectStart + index} 0 R >>`,
      'latin1'
    ));
  });
  objects.push(
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1')
  );
  if (logo) {
    objects.push(Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true /Filter /FlateDecode /Length ${logo.data.length} >>\nstream\n`,
        'latin1'
      ),
      logo.data,
      Buffer.from('\nendstream', 'latin1')
    ]));
  }
  contents.forEach((content) => {
    objects.push(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
      content,
      Buffer.from('endstream', 'latin1')
    ]));
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n', 'latin1')];
  const offsets: number[] = [0];
  let byteLength = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), object, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(chunk);
    byteLength += chunk.length;
  });

  const xrefOffset = byteLength;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'latin1'));
  for (let index = 1; index < offsets.length; index += 1) {
    chunks.push(Buffer.from(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`, 'latin1'));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Rome'
  }).format(date);
}

export function generateReportPdf(definition: ReportDefinition): Buffer {
  const rowsPerPage = 20;
  const pageCount = Math.max(1, Math.ceil(definition.rows.length / rowsPerPage));
  const totalWeight = definition.columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = definition.columns.map((column) => CONTENT_WIDTH * (column.weight / totalWeight));
  const generatedAt = definition.generatedAt || new Date();
  const logo = getReportLogo();
  const contents: Buffer[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = new ReportPdfPage();
    const pageRows = definition.rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    if (logo) page.image('Im1', MARGIN, 13, 72, 48);
    else page.text(MARGIN, 22, 'NFRP', 9, { font: 'F2', color: 'red' });
    const titleX = logo ? MARGIN + 84 : MARGIN;
    page.text(titleX, 27, definition.title.toUpperCase(), 19, { font: 'F2', width: 440 });
    if (definition.subtitle) page.text(titleX, 53, definition.subtitle, 8, { color: 'muted', width: 470 });
    page.text(PAGE_WIDTH - MARGIN - 235, 24, `Generato: ${formatGeneratedAt(generatedAt)}`, 8, { align: 'right', color: 'muted', width: 235 });
    page.text(PAGE_WIDTH - MARGIN - 235, 39, `Pagina ${pageIndex + 1} di ${pageCount}`, 8, { align: 'right', color: 'muted', width: 235 });
    if (definition.filters?.length) {
      page.text(PAGE_WIDTH - MARGIN - 300, 56, `Filtri: ${definition.filters.join(' · ')}`, 7, { align: 'right', color: 'muted', width: 300 });
    }
    page.line(MARGIN, 78, PAGE_WIDTH - MARGIN, 78, 'red', 1.4);

    const metricGap = 8;
    const metricCount = Math.max(1, Math.min(5, definition.metrics.length));
    const metricWidth = (CONTENT_WIDTH - metricGap * (metricCount - 1)) / metricCount;
    definition.metrics.slice(0, 5).forEach((metric, index) => {
      const x = MARGIN + index * (metricWidth + metricGap);
      page.rect(x, 91, metricWidth, 46, { fill: index === 0 ? 'softRed' : 'soft', stroke: index === 0 ? 'red' : 'border' });
      page.text(x + 9, 99, metric.label.toUpperCase(), 6.5, { font: 'F2', color: index === 0 ? 'red' : 'muted', width: metricWidth - 18 });
      page.text(x + 9, 114, metric.value, 13, { font: 'F2', width: metricWidth - 18 });
    });

    const tableTop = 153;
    const headerHeight = 24;
    const rowHeight = 19;
    page.rect(MARGIN, tableTop, CONTENT_WIDTH, headerHeight, { fill: 'black' });
    let x = MARGIN;
    definition.columns.forEach((column, index) => {
      page.text(x + 5, tableTop + 7, column.label.toUpperCase(), 6.5, { align: column.align, color: 'white', font: 'F2', width: widths[index] - 10 });
      x += widths[index];
    });

    if (pageRows.length === 0) {
      page.rect(MARGIN, tableTop + headerHeight, CONTENT_WIDTH, rowHeight * 2, { fill: 'soft', stroke: 'border' });
      page.text(MARGIN + 8, tableTop + headerHeight + 13, 'Nessuna riga nel filtro selezionato.', 8, { color: 'muted', width: CONTENT_WIDTH - 16 });
    } else {
      pageRows.forEach((row, rowIndex) => {
        const top = tableTop + headerHeight + rowIndex * rowHeight;
        if (rowIndex % 2 === 1) page.rect(MARGIN, top, CONTENT_WIDTH, rowHeight, { fill: 'soft' });
        page.line(MARGIN, top + rowHeight, PAGE_WIDTH - MARGIN, top + rowHeight, 'border', 0.45);
        let cellX = MARGIN;
        definition.columns.forEach((column, columnIndex) => {
          page.text(cellX + 5, top + 6, row[column.key] || '-', 7, { align: column.align, width: widths[columnIndex] - 10 });
          cellX += widths[columnIndex];
        });
      });
    }

    page.text(MARGIN, PAGE_HEIGHT - 22, `${definition.rows.length} righe complessive`, 7, { color: 'muted' });
    page.text(PAGE_WIDTH - MARGIN - 250, PAGE_HEIGHT - 22, 'Documento gestionale interno · NFRP ERP Trasporti', 7, { align: 'right', color: 'muted', width: 250 });
    contents.push(page.render());
  }

  return buildPdf(contents, logo);
}
