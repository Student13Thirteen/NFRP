import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function findFiles(root: string, fileName: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return findFiles(fullPath, fileName);
    return entry.isFile() && entry.name === fileName ? [fullPath] : [];
  });
}

function source(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('authentication boundary structure', () => {
  const protectedRoot = path.join(process.cwd(), 'src/app/(protected)');

  it('guards every protected page before page-specific work', () => {
    const pageFiles = findFiles(protectedRoot, 'page.tsx');

    expect(pageFiles.length).toBeGreaterThan(0);
    for (const pageFile of pageFiles) {
      expect(source(pageFile), pageFile).toMatch(
        /export default async function[^\n]*\{\n  await requireUser\(\);/
      );
    }
  });

  it('guards every exported Server Action as its first instruction', () => {
    const actionFiles = findFiles(protectedRoot, 'actions.ts');

    expect(actionFiles.length).toBeGreaterThan(0);
    for (const actionFile of actionFiles) {
      const actionSource = source(actionFile);
      const exports = actionSource.match(/^export async function/gm) ?? [];
      const guardedExports =
        actionSource.match(/^export async function[^\n]*\{\n  await requireUser\(\);/gm) ?? [];

      expect(guardedExports.length, actionFile).toBe(exports.length);
    }
  });

  it('authenticates protected API routes before request data, params or protected services', () => {
    const apiRoot = path.join(process.cwd(), 'src/app/api');
    const publicSessionExceptions = new Set([
      path.join(apiRoot, 'health/route.ts'),
      path.join(apiRoot, 'ingestion/route.ts'),
      path.join(apiRoot, 'flash/route.ts'),
      // Company branding is intentionally visible on anonymous/login screens.
      path.join(apiRoot, 'branding/logo/route.ts')
    ]);

    for (const routeFile of findFiles(apiRoot, 'route.ts')) {
      if (publicSessionExceptions.has(routeFile)) continue;

      const routeSource = source(routeFile);
      const handlerStart = routeSource.search(/^export async function (?:GET|POST|PUT|PATCH|DELETE)/m);
      expect(handlerStart, routeFile).toBeGreaterThanOrEqual(0);

      const handlerSource = routeSource.slice(handlerStart);
      const authIndex = handlerSource.indexOf('await getCurrentUser()');
      expect(authIndex, routeFile).toBeGreaterThanOrEqual(0);

      const protectedWorkIndexes = [
        handlerSource.indexOf('request.json()'),
        handlerSource.indexOf('request.formData()'),
        handlerSource.indexOf('await params'),
        handlerSource.indexOf('prisma.'),
        handlerSource.indexOf('readStored'),
        handlerSource.indexOf('runAssistantTool(')
      ].filter((index) => index >= 0);

      if (protectedWorkIndexes.length > 0) {
        expect(authIndex, routeFile).toBeLessThan(Math.min(...protectedWorkIndexes));
      }
    }
  });
});
