import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Angular's static output names its client-rendered entry index.csr.html.
// GitHub Pages needs index.html at /. Preserve the client entry and its head
// metadata, with a fallback visible only when JavaScript is disabled.
// The separate prerendered /features/index.html remains unchanged.
const root = new URL('../dist-mockingbird/browser/', import.meta.url);
const html = await readFile(new URL('index.csr.html', root), 'utf8');
// Tool pages come from the one registry the app's routes and prerendering use.
const focusedTools = JSON.parse(
  await readFile(new URL('../src/app/focused-tools.json', import.meta.url), 'utf8'),
);
const toolLinks = focusedTools
  .map((tool) => `      <li><a href="/${tool.path}/">${tool.title}</a></li>`)
  .join('\n');
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
      <li><a href="/for/bluesky/">Bluesky and Mastodon in one place</a></li>
      <li><a href="/for/twitter-exodus/">A fresh start after Twitter</a></li>
      <li><a href="/for/instagram/">Photo viewing</a></li>
      <li><a href="/for/creators/">Writing and photography</a></li>
      <li><a href="/for/power-users/">Advanced controls for power users</a></li>
      <li><a href="/help/">Help: short guides, one task at a time</a></li>
      <li><a href="/follow/">Who to follow on Mastodon: starter kits</a></li>
${toolLinks}
      <li><a href="/about/">Why Mawkingbird exists</a></li>
      <li><a href="/blog/">Blog</a></li>
    </ul>
  </main>
</noscript>`;
// The front page and /features/ describe the same app (APP_STRUCTURED_DATA in
// seo.ts). The client sets it at runtime; copy the prerendered block so
// crawlers that skip JavaScript see it on the root too.
const features = await readFile(new URL('features/index.html', root), 'utf8');
const appData = features.match(/<script type="application\/ld\+json">[^<]*<\/script>/)?.[0];
if (!appData) throw new Error('prepare-seo-index: /features/ has no structured data to copy');
await writeFile(
  new URL('index.html', root),
  html.replace('</head>', `${appData}</head>`).replace('</body>', `${fallback}</body>`),
);

// Tool pages are listed from the registry; starter-kit pages follow the bundled
// kits, which change with catalogue refreshes, so their entries come from what
// was actually prerendered. check-seo-build.mjs compares the result exactly.
const kits = (await readdir(new URL('follow/', root), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const sitemapUrl = new URL('sitemap.xml', root);
const entries = [
  ...focusedTools.map((tool) => `${tool.path}/`),
  'follow/',
  ...kits.map((slug) => `follow/${slug}/`),
]
  .map((page) => `  <url><loc>https://mawkingbird.com/${page}</loc></url>`)
  .join('\n');
const sitemap = (await readFile(sitemapUrl, 'utf8')).replace('</urlset>', `${entries}\n</urlset>`);
await writeFile(sitemapUrl, withLastmod(sitemap));

/**
 * Dates each sitemap URL by the last commit to the files that render it, so
 * search engines can tell which pages changed. Paths are relative to ui/. A new
 * public page must be added here, or the build fails rather than guess a date.
 */
function withLastmod(xml) {
  const features = 'src/app/pages/features/';
  const kitData = [`${features}follow-kits.ts`, 'src/app/bundled-starter-kits.generated.ts'];
  const sources = (page) => {
    if (page === '') return ['src/index.html', 'scripts/prepare-seo-index.mjs'];
    if (page === 'features/') return [`${features}features.html`, `${features}features.ts`];
    if (page.startsWith('for/'))
      return [`${features}audience-content.ts`, `${features}audience-page.html`];
    if (page === 'about/') return ['src/app/pages/about/', 'src/app/pages/docs/public-copy.ts'];
    if (page === 'funding/') return ['src/app/pages/funding/', 'src/app/pages/docs/public-copy.ts'];
    if (page === 'blog/') return ['src/app/pages/docs/'];
    // Mini-app pages: their own directory (or the one they share), the page
    // chrome they share, and the registry entry that titles and describes them.
    const tool = focusedTools.find((entry) => `${entry.path}/` === page);
    if (tool)
      return [
        `src/app/pages/${tool.sources ?? tool.path}/`,
        'src/app/pages/focused-apps/',
        'src/app/focused-tools.json',
      ];
    if (page === 'follow/') return [`${features}follow-hub.html`, ...kitData];
    if (page.startsWith('follow/')) return [`${features}follow-kit.html`, ...kitData];
    throw new Error(`prepare-seo-index: no lastmod sources for sitemap page "${page}"`);
  };
  const git = (...args) => {
    try {
      return execFileSync('git', args, {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
  // A shallow clone would date every page to its one commit; leave dates out.
  const fullHistory = git('rev-parse', '--is-shallow-repository') === 'false';
  if (!fullHistory) console.warn('prepare-seo-index: no full git history; sitemap has no lastmod');
  return xml.replace(/<loc>https:\/\/mawkingbird\.com\/([^<]*)<\/loc><\/url>/g, (entry, page) => {
    const paths = sources(page);
    if (!fullHistory) return entry;
    const spec = ['--', ...paths, ':(exclude)*.spec.ts'];
    // Uncommitted edits (a local build) make the page newer than any commit.
    const date = git('status', '--porcelain', ...spec)
      ? new Date().toISOString().slice(0, 10)
      : git('log', '-1', '--format=%cs', ...spec);
    return date ? entry.replace('</url>', `<lastmod>${date}</lastmod></url>`) : entry;
  });
}
