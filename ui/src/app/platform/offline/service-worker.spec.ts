import { describe, expect, it } from 'vitest';
// The real worker file. Outside a service worker it only publishes its pure
// routing functions, so these tests exercise exactly what ships.
import '../../../../public/sw.js';
import { cacheTag } from './offline-app';

interface WorkerCore {
  KILL_SWITCH: boolean;
  SUBPATHS: string[];
  classify(url: string, method: string, mode: string, origin: string, scope: string): string;
  cacheNames(scope: string): { immutable: string; shell: string };
  referencedBuildFiles(html: string): string[];
}

const core = (globalThis as unknown as { __mbServiceWorker: WorkerCore }).__mbServiceWorker;
const ORIGIN = 'https://mawkingbird.com';
const kind = (path: string, mode = 'no-cors', scope = '/', method = 'GET') =>
  core.classify(ORIGIN + path, method, mode, ORIGIN, scope);

describe('service worker routing', () => {
  it('ships with the kill switch off', () => {
    expect(core.KILL_SWITCH).toBe(false);
  });

  it('serves hashed build files from the cache', () => {
    expect(kind('/main-6H6XLQTR.js')).toBe('immutable');
    expect(kind('/chunk-BR4UJTLC.js')).toBe('immutable');
    expect(kind('/styles-R4OVMXKE.css')).toBe('immutable');
    expect(kind('/media/inter-ABCDEFGH.woff2')).toBe('immutable');
  });

  it('keeps unhashed shell files network-first with a saved fallback', () => {
    expect(kind('/boot.js')).toBe('static');
    expect(kind('/i18n/en.json?v=abc')).toBe('static');
    expect(kind('/site.webmanifest')).toBe('static');
    expect(kind('/favicon-32x32.png')).toBe('static');
  });

  it('leaves the probe, data files, APIs and other sites alone', () => {
    expect(kind('/probe.txt?t=1')).toBe('pass');
    expect(kind('/mastodon-servers.json')).toBe('pass');
    expect(kind('/dict/en.json')).toBe('pass');
    expect(
      core.classify('https://mastodon.social/api/v1/timelines/home', 'GET', 'cors', ORIGIN, '/'),
    ).toBe('pass');
    expect(kind('/main-6H6XLQTR.js', 'no-cors', '/', 'POST')).toBe('pass');
  });

  it('answers app navigations, but never for previews or the static sites', () => {
    expect(kind('/', 'navigate')).toBe('navigate');
    expect(kind('/settings/connections', 'navigate')).toBe('navigate');
    expect(kind('/canary/settings', 'navigate')).toBe('pass');
    expect(kind('/test/', 'navigate')).toBe('pass');
    expect(kind('/help/getting-started/', 'navigate')).toBe('pass');
    expect(kind('/news/', 'navigate')).toBe('pass');
    expect(kind('/canary/chunk-BR4UJTLC.js')).toBe('pass');
  });

  it('works inside a preview scope', () => {
    expect(kind('/canary/chunk-BR4UJTLC.js', 'no-cors', '/canary/')).toBe('immutable');
    expect(kind('/canary/feeds', 'navigate', '/canary/')).toBe('navigate');
    expect(kind('/feeds', 'navigate', '/canary/')).toBe('pass');
  });

  it('gives each scope its own caches, matching the page side', () => {
    expect(core.cacheNames('/').immutable).toBe('mawkingbird-root-build');
    expect(core.cacheNames('/canary/').shell).toBe('mawkingbird-canary-shell');
    expect(core.cacheNames('/canary/').immutable).toContain(cacheTag('/canary/'));
    expect(cacheTag('/')).toBe('root');
  });

  it('finds the build files an index.html refers to', () => {
    const html = `<link rel="stylesheet" href="styles-R4OVMXKE.css">
      <link rel="modulepreload" href="chunk-3Z77WYV6.js">
      <script src="boot.js"></script>
      <script src="main-6H6XLQTR.js" type="module"></script>
      <a href="https://mawkingbird.com/">home</a>
      <link rel="modulepreload" href="chunk-3Z77WYV6.js">`;
    expect(core.referencedBuildFiles(html)).toEqual([
      'styles-R4OVMXKE.css',
      'chunk-3Z77WYV6.js',
      'main-6H6XLQTR.js',
    ]);
  });
});
