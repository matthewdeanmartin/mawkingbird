import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';

// Preview noindex must be in the response, before a crawler executes Angular.
export function stampPreviewSeo(html) {
  const document = new JSDOM(html).window.document;
  const base = document.querySelector('base')?.getAttribute('href');
  if (base === '/canary/' || base === '/test/') {
    const robots = document.querySelector('meta[name="robots"]');
    const stamped = robots
      ? html.replace(
          /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i,
          '<meta name="robots" content="noindex, follow">',
        )
      : html.replace('</head>', '<meta name="robots" content="noindex, follow"></head>');
    // Keep Angular's emitted HTML serialization intact: publishing checks its base tag.
    return stamped.replace(/<link\b[^>]*rel="canonical"[^>]*>/g, '');
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = path.resolve(import.meta.dirname, '../dist-mockingbird/browser/index.html');
  const html = await readFile(file, 'utf8');
  const stamped = stampPreviewSeo(html);
  if (stamped !== html) {
    await writeFile(file, stamped);
    console.log('Preview SEO: noindex in the delivered HTML.');
  }
}
