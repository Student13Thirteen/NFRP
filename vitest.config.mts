import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node'
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      'server-only': path.resolve(projectRoot, 'src/test/server-only-stub.ts')
    }
  }
});
