import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  languageFolder,
  loadFocusedTools,
  registrySources,
  translatedLanguages,
} from './focused-tools-registry.mjs';

// Angular's static output names its client-rendered entry index.csr.html.
// GitHub Pages needs index.html at /. Preserve the client entry and its head
// metadata, with a fallback visible only when JavaScript is disabled.
// The separate prerendered /features/index.html remains unchanged.
const root = new URL('../dist-mockingbird/browser/', import.meta.url);
const html = await readFile(new URL('index.csr.html', root), 'utf8');
// Tool pages come from the one registry the app's routes and prerendering use.
const focusedTools = await loadFocusedTools();
const registryFiles = await registrySources();
// Feed Builder topic pages ("starter kits"): one per topic and language, with
// the hub at /communities/. Paths and their language sets come from one file.
const feedPaths = JSON.parse(
  await readFile(
    new URL('../src/app/pages/feed-builder/feed-builder-paths.json', import.meta.url),
    'utf8',
  ),
);
const feedPages = Object.entries(feedPaths).flatMap(([topic, langs]) =>
  Object.entries(langs).map(([lang, path]) => ({ topic, lang, path })),
);
// One communities hub per language with topic pages, all alternates of one another.
const feedHubs = Object.entries(
  JSON.parse(
    await readFile(
      new URL('../src/app/pages/feed-builder/feed-builder-hubs.json', import.meta.url),
      'utf8',
    ),
  ),
).map(([lang, hub]) => ({ lang, path: hub.path }));
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
      <li><a href="/follow/">Who to follow on Mastodon: hand-picked starter kits</a></li>
      <li><a href="/communities/">Mastodon communities by interest: hashtags, people and servers</a></li>
      <li><a href="/tools/">Free tools for Mastodon and Bluesky</a></li>
${toolLinks}
      <li><a href="/about/">Why Mawkingbird exists</a></li>
      <li><a href="/legal/">About and legal</a></li>
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

// Renamed public pages. GitHub Pages cannot send a 301, so the old address
// keeps a page that redirects at once and names the new one as canonical; search
// engines treat that as a permanent move. Not in the sitemap.
const MOVED = { blog: 'legal' };
for (const [from, to] of Object.entries(MOVED)) {
  const target = `https://mawkingbird.com/${to}/`;
  await mkdir(new URL(`${from}/`, root), { recursive: true });
  await writeFile(
    new URL(`${from}/index.html`, root),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=/${to}/">
</head>
<body><p>This page moved to <a href="/${to}/">${target}</a>.</p></body>
</html>
`,
  );
}

// Tool pages are listed from the registry; starter-kit pages follow the bundled
// kits, which change with catalogue refreshes, so their entries come from what
// was actually prerendered. check-seo-build.mjs compares the result exactly.
const kits = (await readdir(new URL('follow/', root), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const sitemapUrl = new URL('sitemap.xml', root);
// A tool page in several languages lists every version, itself included, plus
// English as x-default: the same set the page's own <link rel="alternate"> has.
// /tools/ and every language's index (/de/, /fr/, …) are one page in several languages.
const indexPair = [
  ['en', 'tools'],
  ...(await translatedLanguages()).map((lang) => [lang, languageFolder(lang)]),
];
const indexPages = indexPair.map(([, path]) => `${path}/`);
const alternateLinks = (pairs) =>
  pairs
    .map(
      ([lang, path]) =>
        `<xhtml:link rel="alternate" hreflang="${lang}" href="https://mawkingbird.com/${path}/"/>`,
    )
    .join('');
const alternates = (page) => {
  if (indexPages.includes(page)) return alternateLinks([...indexPair, ['x-default', 'tools']]);
  if (feedHubs.some((hub) => `${hub.path}/` === page))
    return feedHubs.length < 2
      ? ''
      : alternateLinks([
          ...feedHubs.map((hub) => [hub.lang, hub.path]),
          ['x-default', feedHubs.find((hub) => hub.lang === 'en').path],
        ]);
  const feedPage = feedPages.find((entry) => `${entry.path}/` === page);
  if (feedPage) {
    const versions = feedPages.filter((entry) => entry.topic === feedPage.topic);
    if (versions.length < 2) return '';
    const english = versions.find((entry) => entry.lang === 'en');
    return alternateLinks([
      ...versions.map((entry) => [entry.lang, entry.path]),
      ...(english ? [['x-default', english.path]] : []),
    ]);
  }
  const tool = focusedTools.find((entry) => `${entry.path}/` === page);
  if (!tool) return '';
  const originalId = tool.translationOf ?? tool.id;
  const versions = focusedTools.filter(
    (entry) => entry.id === originalId || entry.translationOf === originalId,
  );
  if (versions.length < 2) return '';
  const english = versions.find((entry) => (entry.lang ?? 'en') === 'en');
  return [
    ...versions.map((entry) => [entry.lang ?? 'en', entry.path]),
    ...(english ? [['x-default', english.path]] : []),
  ]
    .map(
      ([lang, path]) =>
        `<xhtml:link rel="alternate" hreflang="${lang}" href="https://mawkingbird.com/${path}/"/>`,
    )
    .join('');
};
const entries = [
  ...indexPages,
  ...focusedTools.map((tool) => `${tool.path}/`),
  'follow/',
  ...kits.map((slug) => `follow/${slug}/`),
  ...feedHubs.map((hub) => `${hub.path}/`),
  ...feedPages.map((entry) => `${entry.path}/`),
]
  .map((page) => `  <url><loc>https://mawkingbird.com/${page}</loc>${alternates(page)}</url>`)
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
    if (indexPages.includes(page)) return ['src/app/pages/tools/', ...registryFiles];
    if (page.startsWith('for/'))
      return [`${features}audience-content.ts`, `${features}audience-page.html`];
    if (page === 'about/') return ['src/app/pages/about/', 'src/app/pages/docs/public-copy.ts'];
    if (page === 'funding/') return ['src/app/pages/funding/', 'src/app/pages/docs/public-copy.ts'];
    if (page === 'legal/') return ['src/app/pages/docs/'];
    // Mini-app pages: their own directory (or the one they share), the page
    // chrome they share, and the registry entry that titles and describes them.
    const tool = focusedTools.find((entry) => `${entry.path}/` === page);
    if (tool)
      return [
        `src/app/pages/${tool.sources ?? tool.path}/`,
        'src/app/pages/focused-apps/',
        // Its own entry: English, the paths (its hreflang set), its language's words.
        'src/app/focused-tools.json',
        'src/app/tool-translations/paths.json',
        ...(tool.lang ? [`src/app/tool-translations/${tool.lang}.json`] : []),
      ];
    if (page === 'follow/') return [`${features}follow-hub.html`, ...kitData];
    if (page.startsWith('follow/')) return [`${features}follow-kit.html`, ...kitData];
    const feed = 'src/app/pages/feed-builder/';
    if (feedHubs.some((hub) => `${hub.path}/` === page)) return [feed];
    const feedPage = feedPages.find((entry) => `${entry.path}/` === page);
    if (feedPage)
      return [
        `${feed}feed-builder-page.html`,
        `${feed}feed-builder-page.ts`,
        `${feed}feed-builder.css`,
        `${feed}feed-builder-chrome.ts`,
        `${feed}feed-builder-paths.json`,
        `${feed}copy/${feedPage.topic}.ts`,
        `${feed}data/${feedPage.topic}.${feedPage.lang}.json`,
      ];
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
  // Language alternates (<xhtml:link …/>) may sit between <loc> and </url>.
  const url = /<loc>https:\/\/mawkingbird\.com\/([^<]*)<\/loc>((?:<xhtml:link [^>]*\/>)*)<\/url>/g;
  return xml.replace(url, (entry, page) => {
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
