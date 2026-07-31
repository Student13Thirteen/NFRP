import { describe, expect, it } from 'vitest';
import { paginateItems } from '@/lib/pagination';

const rows = Array.from({ length: 235 }, (_, index) => index + 1);

describe('paginateItems', () => {
  it('supporta i tagli 50, 100 e 200', () => {
    expect(paginateItems(rows, '2', '100').items).toEqual(rows.slice(100, 200));
    expect(paginateItems(rows, '2', '200').items).toEqual(rows.slice(200));
  });

  it('mostra tutti i record in una sola pagina', () => {
    const pagination = paginateItems(rows, '9', 'all');
    expect(pagination.currentPage).toBe(1);
    expect(pagination.totalPages).toBe(1);
    expect(pagination.items).toEqual(rows);
  });

  it('ripiega sul valore predefinito per parametri non validi', () => {
    expect(paginateItems(rows, '1', '500').items).toHaveLength(50);
  });
});
