import { readFile, writeFile } from 'node:fs/promises';

// Angular's static output names its client-rendered entry index.csr.html.
// GitHub Pages needs index.html at /. Preserve the client entry and its head
// metadata, with a fallback visible only when JavaScript is disabled.
// The separate prerendered /features/index.html remains unchanged.
const root = new URL('../dist-mockingbird/browser/', import.meta.url);
const html = await readFile(new URL('index.csr.html', root), 'utf8');
// Keep the live app dispatcher intact, while giving non-JavaScript visitors
// real public content and crawlable links into the prerendered reference.
const fallback = `<noscript>
  <main lang="en">
    <h1>Mawkingbird — Mastodon, Bluesky and RSS</h1>
    <p>Your feeds, your reading, your words. Bring social feeds, readable articles,
      bookmarks and writing together in one browser client.</p>
    <p>The interactive app requires JavaScript. These guides work without it:</p>
    <ul>
      <li><a href="/features/">Discover Mawkingbird features</a></li>
      <li><a href="/for/readers/">News, RSS and reading lists</a></li>
      <li><a href="/for/bluesky/">Bluesky feeds and conversations</a></li>
      <li><a href="/for/twitter-exodus/">A fresh start after Twitter / X</a></li>
      <li><a href="/for/instagram/">Photo viewing</a></li>
      <li><a href="/for/creators/">Writing and photography</a></li>
    </ul>
  </main>
</noscript>`;
await writeFile(new URL('index.html', root), html.replace('</body>', `${fallback}</body>`));
