import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// Preview noindex must be in the response, before a crawler executes Angular.
const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const file = path.join(root, 'index.html');
const html = await readFile(file, 'utf8');
const document = new JSDOM(html).window.document;
const base = document.querySelector('base')?.getAttribute('href');
if (base === '/canary/' || base === '/test/') {
  const robots = document.querySelector('meta[name="robots"]');
  const stamped = robots
    ? html.replace(robots.outerHTML, '<meta name="robots" content="noindex, follow">')
    : html.replace('</head>', '<meta name="robots" content="noindex, follow"></head>');
  // Keep Angular's emitted HTML serialization intact: publishing checks its base tag.
  await writeFile(file, stamped.replace(/<link\b[^>]*rel="canonical"[^>]*>/g, ''));
  console.log(`Preview SEO: ${base} is noindex in the delivered HTML.`);
}
