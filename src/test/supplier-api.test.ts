import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findSupplier: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    supplier: {
      findFirst: mocks.findSupplier,
      create: mocks.createSupplier,
      update: mocks.updateSupplier
    }
  }
}));

import { POST } from '@/app/api/suppliers/route';

describe('quick supplier API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects anonymous requests before parsing the body or touching suppliers', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost/api/suppliers', {
      method: 'POST',
      body: '{not-json'
    }));
    expect(response.status).toBe(401);
    expect(mocks.findSupplier).not.toHaveBeenCalled();
    expect(mocks.createSupplier).not.toHaveBeenCalled();
  });

  it('creates a supplier from the minimal name-only flow', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' });
    mocks.findSupplier.mockResolvedValue(null);
    mocks.createSupplier.mockResolvedValue({ id: 'supplier-1', name: 'Officina Test', active: true });
    const response = await POST(new Request('http://localhost/api/suppliers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Officina Test' })
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ created: true, supplier: { id: 'supplier-1' } });
    expect(mocks.createSupplier).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Officina Test', phone: null, city: null })
    }));
  });

  it('reactivates and selects an existing inactive supplier instead of duplicating it', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1' });
    mocks.findSupplier.mockResolvedValue({ id: 'supplier-1', name: 'Officina Test', active: false });
    mocks.updateSupplier.mockResolvedValue({ id: 'supplier-1', name: 'Officina Test', active: true });
    const response = await POST(new Request('http://localhost/api/suppliers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'officina test' })
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false, supplier: { active: true } });
    expect(mocks.createSupplier).not.toHaveBeenCalled();
    expect(mocks.updateSupplier).toHaveBeenCalledOnce();
  });
});
