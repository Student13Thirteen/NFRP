import { formatDate } from '@/lib/dates';
import {
  formatTripAddress,
  formatTripLoadQuantity,
  formatTripTotalLoadQuantity,
  getDriverLabel,
  getTripProductLineLabel,
  getTripProductLineSalesPointLabel,
  getTripProductLabel,
  getTripProductLines,
  getTripSalesPointSummary,
  getTripStatusLabel,
  type TripWithRelations
} from '@/lib/trips';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 34;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type FontName = 'F1' | 'F2';
type ColorName = 'black' | 'muted' | 'red' | 'white' | 'border' | 'softRed' | 'softGray';

const colors: Record<ColorName, [number, number, number]> = {
  black: [0.07, 0.09, 0.14],
  muted: [0.36, 0.41, 0.5],
  red: [0.78, 0.1, 0.08],
  white: [1, 1, 1],
  border: [0.72, 0.76, 0.82],
  softRed: [1, 0.91, 0.9],
  softGray: [0.95, 0.97, 0.99]
};

function point(value: number): string {
  return value.toFixed(2);
}

function pdfY(top: number): number {
  return PAGE_HEIGHT - top;
}

function escapeText(value: string): string {
  return value
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function colorCommand(color: ColorName, operator: 'rg' | 'RG'): string {
  const [red, green, blue] = colors[color];
  return `${red} ${green} ${blue} ${operator}`;
}

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const normalizedText = text.trim().replace(/\s+/g, ' ');
  if (!normalizedText) return ['-'];

  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.6)));
  const words = normalizedText.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      current = '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function fittedText(text: string, maxWidth: number, maxHeight: number, options?: { maxSize?: number; minSize?: number; maxLines?: number }) {
  const maxSize = options?.maxSize || 24;
  const minSize = options?.minSize || 14;
  const maxLines = options?.maxLines || 2;

  for (let fontSize = maxSize; fontSize >= minSize; fontSize -= 1) {
    const lines = wrapText(text, fontSize, maxWidth);
    const lineHeight = fontSize * 1.12;
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight) {
      return { fontSize, lineHeight, lines };
    }
  }

  const lineHeight = minSize * 1.1;
  return {
    fontSize: minSize,
    lineHeight,
    lines: wrapText(text, minSize, maxWidth).slice(0, maxLines)
  };
}

class PdfPage {
  private commands: string[] = [];

  text(x: number, top: number, text: string, size: number, options?: { font?: FontName; color?: ColorName }) {
    const font = options?.font || 'F1';
    const color = options?.color || 'black';
    this.commands.push(
      'BT',
      `/${font} ${point(size)} Tf`,
      colorCommand(color, 'rg'),
      `1 0 0 1 ${point(x)} ${point(pdfY(top + size))} Tm`,
      `(${escapeText(text)}) Tj`,
      'ET'
    );
  }

  wrappedText(
    x: number,
    top: number,
    width: number,
    text: string,
    size: number,
    options?: { font?: FontName; color?: ColorName; lineHeight?: number; maxLines?: number }
  ): number {
    const lines = wrapText(text, size, width).slice(0, options?.maxLines || 20);
    const lineHeight = options?.lineHeight || size * 1.18;
    lines.forEach((line, index) => {
      this.text(x, top + index * lineHeight, line, size, options);
    });
    return lines.length * lineHeight;
  }

  rect(x: number, top: number, width: number, height: number, options?: { fill?: ColorName; stroke?: ColorName; lineWidth?: number }) {
    if (options?.fill) this.commands.push(colorCommand(options.fill, 'rg'));
    if (options?.stroke) this.commands.push(colorCommand(options.stroke, 'RG'));
    this.commands.push(`${point(options?.lineWidth || 1)} w`);
    this.commands.push(`${point(x)} ${point(pdfY(top + height))} ${point(width)} ${point(height)} re`);
    if (options?.fill && options?.stroke) {
      this.commands.push('B');
    } else if (options?.fill) {
      this.commands.push('f');
    } else {
      this.commands.push('S');
    }
  }

  line(x1: number, top1: number, x2: number, top2: number, color: ColorName = 'border', width = 1) {
    this.commands.push(colorCommand(color, 'RG'), `${point(width)} w`, `${point(x1)} ${point(pdfY(top1))} m`, `${point(x2)} ${point(pdfY(top2))} l`, 'S');
  }

  fittedWrappedText(
    x: number,
    top: number,
    width: number,
    height: number,
    text: string,
    options?: { font?: FontName; color?: ColorName; maxSize?: number; minSize?: number; maxLines?: number }
  ): number {
    const fitted = fittedText(text, width, height, options);
    fitted.lines.forEach((line, index) => {
      this.text(x, top + index * fitted.lineHeight, line, fitted.fontSize, options);
    });
    return fitted.lines.length * fitted.lineHeight;
  }

  box(x: number, top: number, width: number, height: number, label: string, value: string, options?: { red?: boolean; large?: boolean }) {
    this.rect(x, top, width, height, { fill: options?.red ? 'softRed' : 'softGray', stroke: options?.red ? 'red' : 'border', lineWidth: options?.red ? 1.5 : 1 });
    this.text(x + 12, top + 11, label.toUpperCase(), 10, { font: 'F2', color: options?.red ? 'red' : 'muted' });
    this.fittedWrappedText(x + 12, options?.large ? top + 33 : top + 29, width - 24, options?.large ? height - 43 : height - 34, value || '-', {
      font: 'F2',
      color: options?.red ? 'red' : 'black',
      maxSize: options?.large ? 24 : 14,
      minSize: options?.large ? 16 : 9,
      maxLines: options?.large ? 2 : 1
    });
  }

  productBox(x: number, top: number, width: number, height: number, label: string, value: string, hasQuantity: boolean) {
    this.rect(x, top, width, height, {
      fill: hasQuantity ? 'softRed' : 'white',
      stroke: hasQuantity ? 'red' : 'border',
      lineWidth: hasQuantity ? 1.5 : 1
    });
    this.text(x + 10, top + 12, label.toUpperCase(), 11, { font: 'F2', color: hasQuantity ? 'red' : 'muted' });
    this.fittedWrappedText(x + 10, top + 43, width - 20, height - 54, value, {
      font: 'F2',
      color: hasQuantity ? 'red' : 'muted',
      maxSize: hasQuantity ? 38 : 22,
      minSize: 16,
      maxLines: 1
    });
  }

  smallBox(x: number, top: number, width: number, height: number, label: string, value: string) {
    this.rect(x, top, width, height, { fill: 'softGray', stroke: 'border' });
    this.text(x + 10, top + 7, label.toUpperCase(), 8, { font: 'F2', color: 'muted' });
    this.fittedWrappedText(x + 10, top + 22, width - 20, height - 26, value || '-', {
      font: 'F2',
      color: 'black',
      maxSize: 12,
      minSize: 9,
      maxLines: 1
    });
  }

  render(): Buffer {
    return Buffer.from(`${this.commands.join('\n')}\n`, 'latin1');
  }
}

function getPlateForPdf(vehicle: { plate: string } | null): string {
  return vehicle?.plate || '-';
}

function buildPdf(content: Buffer): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${point(PAGE_WIDTH)} ${point(PAGE_HEIGHT)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ].map((object) => Buffer.from(object, 'latin1'));

  const stream = Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
    content,
    Buffer.from('endstream', 'latin1')
  ]);
  objects.push(stream);

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xff\xff\xff\xff\n', 'latin1')];
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), objects[index], Buffer.from('\nendobj\n', 'latin1'));
  }

  const xrefOffset = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, 'latin1'));
  for (let index = 1; index < offsets.length; index += 1) {
    chunks.push(Buffer.from(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`, 'latin1'));
  }
  chunks.push(
    Buffer.from(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'latin1'
    )
  );

  return Buffer.concat(chunks);
}

export function generateTripPdf(trip: TripWithRelations): Buffer {
  const page = new PdfPage();
  const productLines = getTripProductLines(trip);
  const firstProductLine = productLines[0];
  const salesPoint = firstProductLine?.salesPoint || trip.salesPoint;
  const plantCode = salesPoint.plantCode || 'N/D';
  const salesPointAddress = formatTripAddress(salesPoint);
  const productName = firstProductLine ? getTripProductLineLabel(firstProductLine) : getTripProductLabel(trip);
  const productNotes = productLines.length === 1 ? firstProductLine?.product?.notes?.trim() : undefined;
  const totalQuantity = formatTripTotalLoadQuantity(trip);
  const salesPointSummary = getTripSalesPointSummary(trip);
  const ddtLabel = [trip.transportDocumentNumber, trip.transportDocumentDate ? formatDate(trip.transportDocumentDate) : null]
    .filter(Boolean)
    .join(' - ');

  page.text(MARGIN, 28, 'NFRP', 11, { font: 'F2', color: 'muted' });
  page.text(MARGIN, 46, 'FOGLIO VIAGGIO AUTISTA', 22, { font: 'F2' });
  page.text(MARGIN, 74, `DATA ${formatDate(trip.tripDate)}   STATO ${getTripStatusLabel(trip.status)}`, 12, {
    font: 'F2',
    color: 'muted'
  });
  page.line(MARGIN, 96, PAGE_WIDTH - MARGIN, 96);

  page.rect(MARGIN, 112, CONTENT_WIDTH, 230, { fill: 'softRed', stroke: 'red', lineWidth: 2 });
  page.text(MARGIN + 16, 130, productLines.length > 1 ? 'PUNTI DI CONSEGNA' : 'PUNTO DI CONSEGNA', 15, { font: 'F2', color: 'red' });
  page.rect(MARGIN + 16, 160, 150, 96, { fill: 'white', stroke: 'red', lineWidth: 1.5 });
  page.text(MARGIN + 28, 176, 'CODICE IMPIANTO', 10, { font: 'F2', color: 'red' });
  page.fittedWrappedText(MARGIN + 28, 202, 126, 46, plantCode, {
    font: 'F2',
    color: 'red',
    maxSize: 50,
    minSize: 24,
    maxLines: 1
  });
  page.fittedWrappedText(MARGIN + 184, 150, CONTENT_WIDTH - 206, 84, productLines.length > 1 ? salesPointSummary : salesPoint.name, {
    font: 'F2',
    color: 'red',
    maxSize: 38,
    minSize: 22,
    maxLines: 2
  });
  page.line(MARGIN + 16, 276, PAGE_WIDTH - MARGIN - 16, 276, 'red', 1.2);
  page.text(MARGIN + 16, 292, productLines.length > 1 ? 'PRIMO INDIRIZZO DI CONSEGNA' : 'INDIRIZZO DI CONSEGNA', 10, { font: 'F2', color: 'red' });
  page.fittedWrappedText(MARGIN + 16, 308, CONTENT_WIDTH - 32, 25, salesPointAddress || '-', {
    font: 'F2',
    color: 'black',
    maxSize: 18,
    minSize: 12,
    maxLines: 1
  });

  page.rect(MARGIN, 360, CONTENT_WIDTH, 250, { fill: 'white', stroke: 'border', lineWidth: 1 });
  page.fittedWrappedText(MARGIN + 14, 379, CONTENT_WIDTH - 28, 20, 'QUANTITÀ DA SCARICARE', {
    font: 'F2',
    color: 'black',
    maxSize: 16,
    minSize: 12,
    maxLines: 1
  });
  const loadGap = 12;
  const loadInnerWidth = CONTENT_WIDTH - 28;
  const productBoxLeft = MARGIN + 14;
  const productBoxTop = 412;
  const productBoxHeight = 122;
  const productInnerLeft = productBoxLeft + 14;
  const productInnerWidth = loadInnerWidth - 28;
  page.rect(productBoxLeft, productBoxTop, loadInnerWidth, productBoxHeight, { fill: 'softRed', stroke: 'red', lineWidth: 1.5 });
  if (productLines.length > 1) {
    const salesPointWidth = 200;
    const productNameWidth = productInnerWidth - salesPointWidth - 95;
    const visibleProductLines =
      productLines.length > 6
        ? [
            ...productLines.slice(0, 5),
            {
              salesPointId: null,
              salesPointName: `+${productLines.length - 5} scarichi`,
              productId: null,
              productName: '',
              liters: 0,
              position: 99
            }
          ]
        : productLines;

    page.text(productInnerLeft, 426, 'SCARICHI', 12, { font: 'F2', color: 'red' });
    page.text(productInnerLeft, 448, 'P.TO VENDITA', 8, { font: 'F2', color: 'red' });
    page.text(productInnerLeft + salesPointWidth + 10, 448, 'PRODOTTO', 8, { font: 'F2', color: 'red' });
    page.text(productInnerLeft + salesPointWidth + productNameWidth + 20, 448, 'QTA', 8, { font: 'F2', color: 'red' });
    page.line(productInnerLeft, 462, productInnerLeft + productInnerWidth, 462, 'red', 0.6);

    visibleProductLines.forEach((line, index) => {
      const rowTop = 470 + index * 15;
      const salesPointLabel = getTripProductLineSalesPointLabel(line).toUpperCase();
      const lineLabel = getTripProductLineLabel(line).toUpperCase();
      const lineQuantity = line.liters > 0 ? formatTripLoadQuantity(line) : '';
      page.fittedWrappedText(productInnerLeft, rowTop, salesPointWidth, 11, salesPointLabel, {
        font: 'F2',
        color: 'red',
        maxSize: 9,
        minSize: 6,
        maxLines: 1
      });
      page.fittedWrappedText(productInnerLeft + salesPointWidth + 10, rowTop, productNameWidth, 11, lineLabel, {
        font: 'F2',
        color: 'red',
        maxSize: 9,
        minSize: 6,
        maxLines: 1
      });
      page.fittedWrappedText(productInnerLeft + salesPointWidth + productNameWidth + 20, rowTop, 75, 11, lineQuantity, {
        font: 'F2',
        color: 'red',
        maxSize: 11,
        minSize: 7,
        maxLines: 1
      });
    });
  } else {
    page.text(productInnerLeft, 426, 'PRODOTTO', 12, { font: 'F2', color: 'red' });
    const productNameTop = 448;
    const productNameHeight = productNotes ? 56 : 74;
    const productNameUsedHeight = page.fittedWrappedText(
      productInnerLeft,
      productNameTop,
      productInnerWidth,
      productNameHeight,
      productName.toUpperCase(),
      {
        font: 'F2',
        color: 'red',
        maxSize: 30,
        minSize: 12,
        maxLines: productNotes ? 2 : 4
      }
    );

    if (productNotes) {
      const notesTop = Math.max(productNameTop + productNameUsedHeight + 8, 496);
      page.line(productInnerLeft, notesTop - 7, productInnerLeft + productInnerWidth, notesTop - 7, 'red', 0.6);
      page.fittedWrappedText(productInnerLeft, notesTop, productInnerWidth, productBoxTop + productBoxHeight - notesTop - 8, productNotes, {
        font: 'F2',
        color: 'black',
        maxSize: 11,
        minSize: 7,
        maxLines: 3
      });
    }
  }

  const quantityBoxTop = productBoxTop + productBoxHeight + loadGap;
  const quantityBoxHeight = 58;
  const quantityValueLeft = productLines.length > 1 ? productInnerLeft + 176 : productInnerLeft + 118;
  page.rect(productBoxLeft, quantityBoxTop, loadInnerWidth, quantityBoxHeight, { fill: 'softRed', stroke: 'red', lineWidth: 1.5 });
  page.text(productInnerLeft, quantityBoxTop + 22, productLines.length > 1 ? 'TOTALE QTA' : 'QTA', 12, { font: 'F2', color: 'red' });
  page.fittedWrappedText(quantityValueLeft, quantityBoxTop + 8, productInnerWidth - (quantityValueLeft - productInnerLeft), 42, totalQuantity, {
    font: 'F2',
    color: 'red',
    maxSize: 36,
    minSize: 20,
    maxLines: 1
  });

  const halfWidth = (CONTENT_WIDTH - 12) / 2;
  const detailGap = 8;
  const detailCellWidth = (halfWidth - detailGap) / 2;
  page.box(MARGIN, 614, halfWidth, 48, 'Targa trattore', getPlateForPdf(trip.tractor));
  page.box(MARGIN + halfWidth + 12, 614, halfWidth, 48, 'Targa rimorchio', getPlateForPdf(trip.trailer));
  page.box(MARGIN, 672, detailCellWidth, 48, 'Autista', getDriverLabel(trip.driver));
  page.box(MARGIN + detailCellWidth + detailGap, 672, detailCellWidth, 48, 'Cliente', trip.customerName || '-');
  page.box(MARGIN + halfWidth + 12, 672, detailCellWidth, 48, 'Sequenza', trip.sequenceNumber ? String(trip.sequenceNumber) : '-');
  page.box(MARGIN + halfWidth + 12 + detailCellWidth + detailGap, 672, detailCellWidth, 48, 'Km', trip.expectedKm ? String(trip.expectedKm) : '-');

  if (trip.notes) {
    page.rect(MARGIN, 724, CONTENT_WIDTH, 44, { fill: 'softGray', stroke: 'border' });
    page.text(MARGIN + 10, 735, 'NOTE VIAGGIO', 9, { font: 'F2', color: 'muted' });
    page.fittedWrappedText(MARGIN + 10, 751, CONTENT_WIDTH - 20, 26, trip.notes, {
      font: 'F2',
      color: 'black',
      maxSize: 10,
      minSize: 8,
      maxLines: 2
    });
  }

  const bottomBoxWidth = (CONTENT_WIDTH - 8) / 2;
  page.smallBox(MARGIN, 786, bottomBoxWidth, 34, 'Base di carico', [trip.loadingBase.name, formatTripAddress(trip.loadingBase)].filter(Boolean).join(' - '));
  page.smallBox(MARGIN + bottomBoxWidth + 8, 786, bottomBoxWidth, 34, 'Rif. viaggio / DDT', [trip.customerReference, ddtLabel].filter(Boolean).join(' - '));

  return buildPdf(page.render());
}
