import { describe, expect, it } from 'vitest';
import { generateReportPdf } from '@/lib/report-pdf';

describe('management report PDF generation', () => {
  it('creates a multipage landscape PDF with metrics, filters and all rows', () => {
    const rows = Array.from({ length: 45 }, (_, index) => ({
      date: `17/07/2026`,
      plate: `AA${String(index).padStart(3, '0')}BB`,
      amount: `${index + 1},00 EUR`
    }));
    const pdf = generateReportPdf({
      title: 'Report prova',
      subtitle: 'Controllo gestione',
      generatedAt: new Date('2026-07-17T10:00:00.000Z'),
      filters: ['Targa: AA', 'Periodo: luglio'],
      metrics: [
        { label: 'Totale', value: '1.250,00 EUR' },
        { label: 'Righe', value: '45' }
      ],
      columns: [
        { key: 'date', label: 'Data', weight: 1 },
        { key: 'plate', label: 'Targa', weight: 1 },
        { key: 'amount', label: 'Importo', weight: 1, align: 'right' }
      ],
      rows
    });
    const content = pdf.toString('latin1');

    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(content).toContain('(NFRP)');
    expect(content).toContain('/Count 3');
    expect(content).toContain('REPORT PROVA');
    expect(content).toContain('Targa: AA');
    expect(content).toContain('AA000BB');
    expect(content).toContain('AA044BB');
    expect(content).toContain('Pagina 3 di 3');
  });

  it('normalizes unsupported punctuation and the euro symbol', () => {
    const content = generateReportPdf({
      title: 'Spese d’azienda',
      metrics: [{ label: 'Totale', value: '12,00 €' }],
      columns: [{ key: 'value', label: 'Valore', weight: 1 }],
      rows: [{ value: 'Costo… 12,00 €' }]
    }).toString('latin1');

    expect(content).toContain("SPESE D'AZIENDA");
    expect(content).toContain('12,00 EUR');
    expect(content).toContain('Costo... 12,00 EUR');
  });
});
