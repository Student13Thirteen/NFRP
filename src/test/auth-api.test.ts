import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  selectAssistantPlan: vi.fn(),
  runAssistantTool: vi.fn(),
  findDocument: vi.fn(),
  readStoredPdf: vi.fn()
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock('@/lib/env', () => ({
  getAssistantEnabled: () => true
}));

vi.mock('@/lib/assistant-planner', () => ({
  selectAssistantPlanHeuristic: mocks.selectAssistantPlan
}));

vi.mock('@/lib/assistant-tools', () => ({
  runAssistantTool: mocks.runAssistantTool
}));

vi.mock('@/lib/ollama', () => ({
  OllamaModelUnavailableError: class OllamaModelUnavailableError extends Error {},
  OllamaUnavailableError: class OllamaUnavailableError extends Error {},
  planWithOllama: vi.fn()
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    document: {
      findUnique: mocks.findDocument
    }
  }
}));

vi.mock('@/lib/files', () => ({
  readStoredPdf: mocks.readStoredPdf
}));

import { POST as assistantPost } from '@/app/api/assistant/chat/route';
import { GET as documentFileGet } from '@/app/api/documents/[id]/file/route';

describe('API authentication boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
  });

  it('returns 401 before parsing or executing an anonymous assistant request', async () => {
    const request = new Request('http://localhost/api/assistant/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'richiesta sintetica' })
    });
    const response = await assistantPost(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Non autorizzato.' });
    expect(mocks.selectAssistantPlan).not.toHaveBeenCalled();
    expect(mocks.runAssistantTool).not.toHaveBeenCalled();
  });

  it('returns 401 before looking up or reading an anonymous PDF download', async () => {
    const response = await documentFileGet(
      new NextRequest('http://localhost/api/documents/synthetic-document/file'),
      { params: Promise.resolve({ id: 'synthetic-document' }) }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Non autorizzato' });
    expect(mocks.findDocument).not.toHaveBeenCalled();
    expect(mocks.readStoredPdf).not.toHaveBeenCalled();
  });
});
