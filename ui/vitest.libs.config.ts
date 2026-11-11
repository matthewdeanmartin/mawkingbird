import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// The in-repo libraries (src/lib/*) are tested here, outside the Angular suite:
// plain Vitest, no TestBed, one project per library. A library that declares
// "web": true in lib.json runs under jsdom (DOMParser, URL); the rest run in
// Node. scripts/test-libs.mjs drives this and skips unchanged libraries.
const libRoot = path.join(import.meta.dirname, 'src', 'lib');
const libraries = readdirSync(libRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(libRoot, entry.name, 'lib.json')))
  .map((entry) => ({
    name: entry.name,
    web: JSON.parse(readFileSync(path.join(libRoot, entry.name, 'lib.json'), 'utf8')).web === true,
  }));

export default defineConfig({
  test: {
    projects: libraries.map(({ name, web }) => ({
      test: {
        name,
        root: path.join(libRoot, name),
        include: ['**/*.spec.ts'],
        environment: web ? 'jsdom' : 'node',
      },
    })),
  },
});
