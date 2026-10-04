import { copyFile } from 'node:fs/promises';

// Angular's static output names its client-rendered entry index.csr.html.
// GitHub Pages needs index.html at /. Serve those exact client-entry bytes,
// preserving the head metadata without introducing prerendered homepage UI.
// The separate prerendered /features/index.html remains unchanged.
const root = new URL('../dist-mockingbird/browser/', import.meta.url);
await copyFile(new URL('index.csr.html', root), new URL('index.html', root));
